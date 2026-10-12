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

// Sending only. What each email says (and the shared, site-styled layout)
// is in src/lib/emailContent.ts.
//
// Every sender is non-blocking by design: callers catch and log failures,
// so a bad address or a Resend outage never stops an RSVP or payment from
// saving.

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    client = new Resend(RESEND_API_KEY);
  }
  return client;
}

const FROM_ADDRESS = "Over the Hill <rsvp@overthehill.live>";

async function send(to: string, email: RenderedEmail): Promise<void> {
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  // The Resend SDK resolves with { error } on an API-level failure (e.g. the
  // sandbox sender rejecting a recipient) rather than throwing — without this
  // check a rejected send would silently look identical to a delivered one.
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}

/** "You're registered" / "sorry to miss you", with their answers. Pass
 * the payment when paying is what completed registration. */
export async function sendRsvpConfirmationEmail(
  guest: Guest,
  options: { payment?: RegisteringPayment } = {},
): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, rsvpConfirmationEmail(guest, SITE_URL, options, await getEmailTexts()));
}

/** Something to pay now: see paymentDueEmail. */
export async function sendPaymentDueEmail(
  guest: Guest,
  due: { kind: "deposit" | "balance"; amountPence: number },
): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, paymentDueEmail(guest, SITE_URL, due, await getEmailTexts()));
}

/** The same email to many guests (admin Payments, "Email everyone who has
 * something to pay"), through Resend's batch API: up to 100 per request,
 * which keeps well inside its rate limit. Throws if a batch is rejected;
 * batches already sent stay sent, and the count of those is in the error. */
export async function sendPaymentDueEmails(
  recipients: { guest: Guest; due: { kind: "deposit" | "balance"; amountPence: number } }[],
): Promise<number> {
  const texts = await getEmailTexts();
  const emails = recipients
    .filter(({ guest }) => guest.email)
    .map(({ guest, due }) => {
      const email = paymentDueEmail(guest, SITE_URL, due, texts);
      return { from: FROM_ADDRESS, to: guest.email!, subject: email.subject, text: email.text, html: email.html };
    });
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100);
    const { error } = await getResendClient().batch.send(batch);
    if (error) throw new Error(`Resend rejected the emails after ${sent} were sent: ${error.name} — ${error.message}`);
    sent += batch.length;
  }
  return sent;
}

/** Receipt for a payment after registration (e.g. the balance). */
export async function sendPaymentReceivedEmail(
  guest: Guest,
  amountPence: number,
  pricePence: number | null,
): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, paymentReceivedEmail(guest, SITE_URL, amountPence, pricePence, await getEmailTexts()));
}

/** From the "email me my link" form on /rsvp. Only ever called for a guest
 * whose address matched, so it reveals nothing; the caller shows the same
 * response either way. */
export async function sendMagicLinkEmail(guest: Guest): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, inviteLinkEmail(guest, SITE_URL, await getEmailTexts()));
}

/** A test of one email (admin Emails): the saved wording, filled in with a
 * made-up guest and this site's amounts, marked as a test in the subject. */
export async function sendTestEmail(to: string, id: EmailId): Promise<void> {
  const settings = await getPaymentSettings();
  const email = sampleEmail(id, SITE_URL, await getEmailTexts(), {
    depositPence: settings.depositPence,
    pricePence: settings.standardPricePence,
  });
  await send(to, { ...email, subject: `[Test] ${email.subject}` });
}
