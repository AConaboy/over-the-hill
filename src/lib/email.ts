import { Resend } from "resend";
import Mustache from "mustache";
import { RESEND_API_KEY, SITE_URL } from "astro:env/server";
import type { Guest } from "./guests";
import rsvpConfirmationTemplate from "./emails/rsvp-confirmation.html?raw";

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    client = new Resend(RESEND_API_KEY);
  }
  return client;
}

const FROM_ADDRESS = "Over the Hill <rsvp@overthehill.live>";

function summariseGuest(guest: Guest): string[] {
  const lines: string[] = [];
  lines.push(`Attending: ${guest.attendance === "yes" ? "Yes" : "No, regretfully declining"}`);

  if (guest.attendance === "yes") {
    if (guest.arrival_day) lines.push(`Arriving: ${guest.arrival_day}`);
    if (guest.departure_day) lines.push(`Departing: ${guest.departure_day}`);
    if (guest.camping) lines.push(`Camping: ${guest.camping.replace("_", " ")}`);
    if (guest.vehicle) lines.push(`Vehicle: ${guest.vehicle.replace("_", " ")}`);
    if (guest.dietary) lines.push(`Dietary requirements: ${guest.dietary}`);
    if (guest.accessibility) lines.push(`Accessibility requirements: ${guest.accessibility}`);
    if (guest.notes) lines.push(`Notes: ${guest.notes}`);
  }

  return lines;
}

/** Non-blocking by design: callers should catch/ignore failures so a bad
 * email address or a Resend outage never stops the RSVP itself from saving. */
export async function sendRsvpConfirmationEmail(guest: Guest): Promise<void> {
  if (!guest.email) return;

  const ticketUrl = new URL(`/ticket/${guest.token}`, SITE_URL).toString();
  const summaryLines = summariseGuest(guest);

  const textBody = [
    `Hi ${guest.name},`,
    "",
    "Thanks for letting us know your plans for Over the Hill!",
    "",
    "Here's what we've got down for you:",
    ...summaryLines.map((line) => `- ${line}`),
    "",
    `You can view or update your answers any time here: ${ticketUrl}`,
    "",
    "If your plans change, just use the same link again.",
    "",
    "See you there!",
  ].join("\n");

  const htmlBody = Mustache.render(rsvpConfirmationTemplate, {
    guestName: guest.name,
    ticketUrl,
    summaryLines,
  });

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: guest.email,
    subject: "Your Over the Hill RSVP",
    text: textBody,
    html: htmlBody,
  });

  // The Resend SDK resolves with { error } on an API-level failure (e.g. the
  // sandbox sender rejecting a recipient) rather than throwing — without this
  // check a rejected send would silently look identical to a delivered one.
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}

/** Sent from the "find my link" self-service form on /rsvp. Non-blocking by
 * design, same as sendRsvpConfirmationEmail — callers should catch/ignore
 * failures. Only ever called for a guest row that actually matched the
 * submitted email, so this itself reveals nothing either way; the caller is
 * responsible for showing the same response regardless of match/no-match. */
export async function sendMagicLinkEmail(guest: Guest): Promise<void> {
  if (!guest.email) return;

  const rsvpUrl = new URL(`/rsvp/${guest.token}`, SITE_URL).toString();

  const textBody = [
    `Hi ${guest.name},`,
    "",
    "Here's your personal Over the Hill invite link:",
    "",
    rsvpUrl,
    "",
    "This link is just for you — please don't share it on.",
  ].join("\n");

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: guest.email,
    subject: "Your Over the Hill invite link",
    text: textBody,
  });

  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}
