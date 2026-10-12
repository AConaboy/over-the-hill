import { Resend } from "resend";
import { getDb } from "./db";
import { eventStatement } from "./guests";
import type { RenderedEmail } from "./emailContent";

// Emails Resend couldn't take yet: over its daily (or monthly) limit, too
// many at once, or Resend itself down. They're kept here exactly as they'd
// have gone out, and sent in order by the hourly scheduled job (src/worker.ts)
// or a host's "Try sending now" (admin Emails), once Resend takes them again.
// Errors that retrying won't fix (a bad address, say) aren't queued.
//
// No astro:env here: the scheduled job runs outside a request, so the
// Resend key is passed in.

export const FROM_ADDRESS = "Over the Hill <rsvp@overthehill.live>";

/** Most attempts at an email that keeps failing for good before it's
 * dropped (logged); quota and rate refusals don't count. */
const MAX_ATTEMPTS = 5;
/** Per run, so a run stays short. */
const BATCH = 50;
/** Resend allows about 2 requests a second. */
const GAP_MS = 600;

export interface ResendError {
  name: string;
  statusCode?: number | null;
}

/** Worth trying again later: Resend's limits (daily, monthly, rate), its
 * own failures, or not reaching it at all. */
export function isRetryableResendError(error: ResendError): boolean {
  if (["daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded", "application_error", "internal_server_error"].includes(error.name)) {
    return true;
  }
  return error.statusCode === 429 || (error.statusCode ?? 0) >= 500;
}

interface QueuedEmail {
  id: string;
  guest_id: string | null;
  to_address: string;
  subject: string;
  html: string;
  text: string;
  attempts: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function queueEmail(to: string, email: RenderedEmail, guestId: string | null, reason: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db
      .prepare(
        `insert into email_queue (id, guest_id, to_address, subject, html, text, created_at, attempts, last_error)
         values (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(crypto.randomUUID(), guestId, to, email.subject, email.html, email.text, nowIso(), reason),
    ...(guestId ? [eventStatement(db, guestId, "site", "email_queued", `Email waiting to send (${reason}): ${email.subject}`)] : []),
  ]);
}

export async function countQueuedEmails(): Promise<number> {
  const row = await getDb().prepare("select count(*) as n from email_queue").first<{ n: number }>();
  return row?.n ?? 0;
}

/** Emails waiting only on Resend's limits (or an outage): new emails queue
 * behind these, to keep their order. One that's failed for another reason
 * (attempts > 0, a bad address say) doesn't hold the others up. */
export async function hasEmailsWaitingOnLimits(): Promise<boolean> {
  const row = await getDb().prepare("select 1 as yes from email_queue where attempts = 0 limit 1").first<{ yes: number }>();
  return !!row;
}

/** Sends what's waiting, oldest first, until it's empty, Resend says a
 * limit's been reached, or this run's batch is done. */
export async function flushEmailQueue(apiKey: string | undefined): Promise<{ sent: number; left: number; stoppedBy: string | null }> {
  const db = getDb();
  const { results } = await db
    .prepare("select id, guest_id, to_address, subject, html, text, attempts from email_queue order by created_at, rowid limit ?")
    .bind(BATCH)
    .all<QueuedEmail>();
  if (results.length === 0) return { sent: 0, left: 0, stoppedBy: null };
  if (!apiKey) return { sent: 0, left: await countQueuedEmails(), stoppedBy: "no Resend key" };

  const resend = new Resend(apiKey);
  let sent = 0;
  let stoppedBy: string | null = null;
  for (const [i, email] of results.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    let error: ResendError | null = null;
    try {
      ({ error } = await resend.emails.send({ from: FROM_ADDRESS, to: email.to_address, subject: email.subject, html: email.html, text: email.text }));
    } catch (err) {
      error = { name: "network_error", statusCode: 503 };
      console.error("Queued email: couldn't reach Resend", err);
    }
    if (!error) {
      await db.batch([
        db.prepare("delete from email_queue where id = ?").bind(email.id),
        ...(email.guest_id ? [eventStatement(db, email.guest_id, "site", "email_sent", `Waiting email sent: ${email.subject}`)] : []),
      ]);
      sent++;
      continue;
    }
    const reason = `${error.name}${error.statusCode ? ` (${error.statusCode})` : ""}`;
    // A limit, or Resend not working: stop, and try again next run.
    if (isRetryableResendError(error)) {
      await db.prepare("update email_queue set last_error = ?, last_attempt_at = ? where id = ?").bind(reason, nowIso(), email.id).run();
      stoppedBy = reason;
      break;
    }
    if (email.attempts + 1 >= MAX_ATTEMPTS) {
      console.error(`Queued email to ${email.guest_id ?? "a host"} dropped after ${MAX_ATTEMPTS} attempts: ${reason}`);
      await db.prepare("delete from email_queue where id = ?").bind(email.id).run();
      continue;
    }
    await db
      .prepare("update email_queue set attempts = attempts + 1, last_error = ?, last_attempt_at = ? where id = ?")
      .bind(reason, nowIso(), email.id)
      .run();
  }
  return { sent, left: await countQueuedEmails(), stoppedBy };
}
