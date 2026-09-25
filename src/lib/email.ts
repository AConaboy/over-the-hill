import { Resend } from "resend";
import { RESEND_API_KEY, SITE_URL } from "astro:env/server";
import type { Guest } from "./guests";
import {
  depositDueEmail,
  inviteLinkEmail,
  paymentReceivedEmail,
  rsvpConfirmationEmail,
  type RenderedEmail,
} from "./emailContent";

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
 * depositPaidPence when paying the deposit is what completed registration. */
export async function sendRsvpConfirmationEmail(
  guest: Guest,
  options: { depositPaidPence?: number } = {},
): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, rsvpConfirmationEmail(guest, SITE_URL, options));
}

/** Answers saved, but registration still needs the deposit. */
export async function sendDepositDueEmail(guest: Guest, depositPence: number): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, depositDueEmail(guest, SITE_URL, depositPence));
}

/** Receipt for a payment after registration (e.g. the balance). */
export async function sendPaymentReceivedEmail(
  guest: Guest,
  amountPence: number,
  pricePence: number | null,
): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, paymentReceivedEmail(guest, SITE_URL, amountPence, pricePence));
}

/** From the "email me my link" form on /rsvp. Only ever called for a guest
 * whose address matched, so it reveals nothing; the caller shows the same
 * response either way. */
export async function sendMagicLinkEmail(guest: Guest): Promise<void> {
  if (!guest.email) return;
  await send(guest.email, inviteLinkEmail(guest, SITE_URL));
}
