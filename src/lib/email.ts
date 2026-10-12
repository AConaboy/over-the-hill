import { Resend } from "resend";
import { RESEND_API_KEY, SITE_URL } from "astro:env/server";
import type { Guest } from "./guests";
import {
  inviteLinkEmail,
  paymentDueEmail,
  paymentReceivedEmail,
  rsvpConfirmationEmail,
  sampleEmail,
  type EmailId,
  type RegisteringPayment,
  type RenderedEmail,
} from "./emailContent";
import { getEmailTexts } from "./emailTexts";
import { getPaymentSettings } from "./settings";
import { FROM_ADDRESS, hasEmailsWaitingOnLimits, isRetryableResendError, queueEmail } from "./emailQueue";

// Sending only. What each email says (and the shared, site-styled layout)
// is in src/lib/emailContent.ts.
//
// Every sender is non-blocking by design: callers catch and log failures,
// so a bad address or a Resend outage never stops an RSVP or payment from
// saving. What Resend can't take yet (over its daily limit, or down) is
// queued instead, and goes out later (src/lib/emailQueue.ts): "queued".

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    client = new Resend(RESEND_API_KEY);
  }
  return client;
}

/** "sent", or "queued" to go out later; nothing when there's no address. */
export type EmailResult = "sent" | "queued" | "skipped";

/** `guestId` labels a queued email in their history; `queue: false` (a
 * host's test email) fails instead of waiting. */
async function send(
  to: string,
  email: RenderedEmail,
  guestId: string | null,
  { queue = true }: { queue?: boolean } = {},
): Promise<EmailResult> {
  // Emails already waiting go first, in order; this one waits behind them.
  if (queue && (await hasEmailsWaitingOnLimits())) {
    await queueEmail(to, email, guestId, "others waiting");
    return "queued";
  }

  let error: { name: string; message: string; statusCode?: number | null } | null;
  try {
    ({ error } = await getResendClient().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }));
  } catch (err) {
    if (!queue) throw err;
    console.error("Couldn't reach Resend; queued the email", err);
    await queueEmail(to, email, guestId, "couldn't reach Resend");
    return "queued";
  }

  // The Resend SDK resolves with { error } on an API-level failure (e.g. the
  // sandbox sender rejecting a recipient) rather than throwing — without this
  // check a rejected send would silently look identical to a delivered one.
  if (error) {
    if (queue && isRetryableResendError(error)) {
      console.warn(`Resend can't take the email yet (${error.name}); queued`);
      await queueEmail(to, email, guestId, error.name);
      return "queued";
    }
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
  return "sent";
}

/** "You're registered" / "sorry to miss you", with their answers. Pass
 * the payment when paying is what completed registration. */
export async function sendRsvpConfirmationEmail(
  guest: Guest,
  options: { payment?: RegisteringPayment } = {},
): Promise<EmailResult> {
  if (!guest.email) return "skipped";
  return send(guest.email, rsvpConfirmationEmail(guest, SITE_URL, options, await getEmailTexts()), guest.id);
}

/** Something to pay now: see paymentDueEmail. */
export async function sendPaymentDueEmail(
  guest: Guest,
  due: { kind: "deposit" | "balance"; amountPence: number },
): Promise<EmailResult> {
  if (!guest.email) return "skipped";
  return send(guest.email, paymentDueEmail(guest, SITE_URL, due, await getEmailTexts()), guest.id);
}

/** The same email to many guests (admin Payments, "Email everyone who has
 * something to pay"), through Resend's batch API: up to 100 per request,
 * which keeps well inside its rate limit. When Resend can't take a batch
 * yet (its daily limit, say), that batch and the rest are queued. Throws
 * on any other rejection; batches already sent stay sent, and the count of
 * those is in the error. */
export async function sendPaymentDueEmails(
  recipients: { guest: Guest; due: { kind: "deposit" | "balance"; amountPence: number } }[],
): Promise<{ sent: number; queued: number }> {
  const texts = await getEmailTexts();
  const emails = recipients
    .filter(({ guest }) => guest.email)
    .map(({ guest, due }) => ({ guest, email: paymentDueEmail(guest, SITE_URL, due, texts) }));
  const queueRest = async (from: number, reason: string) => {
    for (const { guest, email } of emails.slice(from)) await queueEmail(guest.email!, email, guest.id, reason);
    return { sent: from, queued: emails.length - from };
  };
  if ((await hasEmailsWaitingOnLimits())) return queueRest(0, "others waiting");
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100);
    const { error } = await getResendClient().batch.send(
      batch.map(({ guest, email }) => ({ from: FROM_ADDRESS, to: guest.email!, subject: email.subject, text: email.text, html: email.html })),
    );
    if (error && isRetryableResendError(error)) return queueRest(sent, error.name);
    if (error) throw new Error(`Resend rejected the emails after ${sent} were sent: ${error.name} — ${error.message}`);
    sent += batch.length;
  }
  return { sent, queued: 0 };
}

/** Receipt for a payment after registration (e.g. the balance). */
export async function sendPaymentReceivedEmail(
  guest: Guest,
  amountPence: number,
  pricePence: number | null,
): Promise<EmailResult> {
  if (!guest.email) return "skipped";
  return send(guest.email, paymentReceivedEmail(guest, SITE_URL, amountPence, pricePence, await getEmailTexts()), guest.id);
}

/** From the "email me my link" form on /rsvp. Only ever called for a guest
 * whose address matched, so it reveals nothing; the caller shows the same
 * response either way. */
export async function sendMagicLinkEmail(guest: Guest): Promise<EmailResult> {
  if (!guest.email) return "skipped";
  return send(guest.email, inviteLinkEmail(guest, SITE_URL, await getEmailTexts()), guest.id);
}

/** A test of one email (admin Emails): the saved wording, filled in with a
 * made-up guest and this site's amounts, marked as a test in the subject. */
export async function sendTestEmail(to: string, id: EmailId): Promise<void> {
  const settings = await getPaymentSettings();
  const email = sampleEmail(id, SITE_URL, await getEmailTexts(), {
    depositPence: settings.depositPence,
    pricePence: settings.standardPricePence,
  });
  await send(to, { ...email, subject: `[Test] ${email.subject}` }, null, { queue: false });
}
