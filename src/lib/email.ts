import { Resend } from "resend";
import { RESEND_API_KEY, SITE_URL } from "astro:env/server";
import type { Guest } from "./guests";

let client: Resend | null = null;

function getResendClient(): Resend {
  if (!client) {
    client = new Resend(RESEND_API_KEY);
  }
  return client;
}

// Resend's shared test/sandbox sender — works for testing but can usually
// only deliver to the Resend account's own email, not arbitrary guests.
// Swap this for an address on a verified domain before real RSVPs go out.
const FROM_ADDRESS = "Over the Hill <onboarding@resend.dev>";

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

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: guest.email,
    subject: "Your Over the Hill RSVP",
    text: textBody,
  });

  // The Resend SDK resolves with { error } on an API-level failure (e.g. the
  // sandbox sender rejecting a recipient) rather than throwing — without this
  // check a rejected send would silently look identical to a delivered one.
  if (error) {
    throw new Error(`Resend rejected the email: ${error.name} — ${error.message}`);
  }
}
