// The words of every email the site sends, rendered into the shared layout
// (src/lib/emails/layout.html) so they all look like the website. Pure: no
// sending, no astro:env, so it can be unit-tested and previewed. Sending
// lives in src/lib/email.ts.

import Mustache from "mustache";
import layoutTemplate from "./emails/layout.html?raw";
import type { Guest } from "./guests";
import { formatPence } from "./money";
import { CAMPING_LABELS, VEHICLE_LABELS } from "./answerLabels";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface EmailContent {
  subject: string;
  /** The inbox preview line. */
  preheader: string;
  guestName: string;
  paragraphs: string[];
  summary?: { heading: string; lines: string[] };
  button?: { label: string; url: string };
  footnote?: string;
  footerReason?: string;
}

const DEFAULT_FOOTER_REASON = "You're getting this email because you RSVP'd to Over the Hill.";

function render(content: EmailContent): RenderedEmail {
  const footerReason = content.footerReason ?? DEFAULT_FOOTER_REASON;
  // The summary box is laid out like a ticket stub: "Label: value" lines
  // become a label and a value side by side (a line with no label spans
  // both).
  const summary = content.summary && {
    heading: content.summary.heading,
    rows: content.summary.lines.map((line) => {
      const colon = line.indexOf(": ");
      return colon > 0 ? { label: line.slice(0, colon), value: line.slice(colon + 2) } : { label: "", value: line };
    }),
  };
  const html = Mustache.render(layoutTemplate, { ...content, summary, footerReason });

  // Plain-text alternative with the same content, for clients that prefer it.
  const text = [
    `Hi ${content.guestName},`,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.summary
      ? [`${content.summary.heading}:`, ...content.summary.lines.map((line) => `- ${line}`), ""]
      : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
    ...(content.footnote ? [content.footnote, ""] : []),
    "See you there!",
    "The Over the Hill hosts",
  ].join("\n");

  return { subject: content.subject, html, text };
}

function summariseAnswers(guest: Guest): string[] {
  const lines: string[] = [];
  lines.push(`Attending: ${guest.attendance === "yes" ? "Yes" : "No, regretfully declining"}`);

  if (guest.attendance === "yes") {
    if (guest.arrival_day) lines.push(`Arriving: ${guest.arrival_day}`);
    if (guest.departure_day) lines.push(`Departing: ${guest.departure_day}`);
    if (guest.camping) lines.push(`Camping: ${CAMPING_LABELS[guest.camping] ?? guest.camping}`);
    if (guest.vehicle) lines.push(`Vehicle: ${VEHICLE_LABELS[guest.vehicle] ?? guest.vehicle}`);
    if (guest.dietary) lines.push(`Dietary requirements: ${guest.dietary}`);
    if (guest.accessibility) lines.push(`Accessibility requirements: ${guest.accessibility}`);
    if (guest.notes) lines.push(`Notes: ${guest.notes}`);
  }

  return lines;
}

/** Their one page: invitation, where they stand, paying, their answers. */
function guestPageUrl(guest: Guest, siteUrl: string): string {
  return new URL(`/rsvp/${guest.token}`, siteUrl).toString();
}

/** "You're registered" (or "sorry to miss you"), with their answers. When
 * paying the deposit is what completed registration, it says so and lists
 * the payment. */
export function rsvpConfirmationEmail(
  guest: Guest,
  siteUrl: string,
  options: { depositPaidPence?: number } = {},
): RenderedEmail {
  const attending = guest.attendance === "yes";
  const lines = summariseAnswers(guest);
  if (options.depositPaidPence !== undefined) lines.push(`Deposit paid: ${formatPence(options.depositPaidPence)}`);

  const paragraphs = !attending
    ? ["Thanks for letting us know. We're sorry you can't make it this time, and we'll miss you."]
    : options.depositPaidPence !== undefined
      ? ["Thanks for paying your deposit. You're registered for Over the Hill! We can't wait to see you in the field."]
      : ["Thanks for letting us know your plans. You're registered for Over the Hill! We can't wait to see you in the field."];

  return render({
    subject: "Your Over the Hill RSVP",
    preheader: attending
      ? "You're registered. Here's what we've got down for you, and a link to your RSVP."
      : "Thanks for letting us know. Here's a link if your plans change.",
    guestName: guest.name,
    paragraphs,
    summary: { heading: "Here's what we've got down for you", lines },
    button: { label: attending ? "View your RSVP" : "View or update your RSVP", url: guestPageUrl(guest, siteUrl) },
    footnote: "Plans change? No problem. Just use the same link any time to update your answers, as often as you like.",
  });
}

/** Their answers are saved, but registration needs the deposit. */
export function depositDueEmail(guest: Guest, siteUrl: string, depositPence: number): RenderedEmail {
  return render({
    subject: "Complete your Over the Hill registration",
    preheader: `Your answers are saved. Pay your ${formatPence(depositPence)} deposit to confirm your place.`,
    guestName: guest.name,
    paragraphs: [
      "Thanks! We've saved your RSVP answers.",
      `Your place isn't confirmed until you've paid your ${formatPence(depositPence)} deposit. You can pay it (and update your answers) from your RSVP page.`,
    ],
    summary: {
      heading: "Still to do",
      lines: [`Pay your deposit: ${formatPence(depositPence)}`],
    },
    button: { label: "Pay your deposit", url: guestPageUrl(guest, siteUrl) },
    footnote: "Once it's paid, your place is confirmed and we'll email you to say so.",
  });
}

/** A receipt for any payment after the one that completed registration
 * (e.g. the balance). `pricePence` is null while the price isn't set. */
export function paymentReceivedEmail(
  guest: Guest,
  siteUrl: string,
  amountPence: number,
  pricePence: number | null,
): RenderedEmail {
  const paid = guest.amount_paid_pence ?? 0;
  const lines = [`This payment: ${formatPence(amountPence)}`, `Paid so far: ${formatPence(paid)}`];
  let footnote: string | undefined;
  if (pricePence === null) {
    lines.push("Ticket price: to be confirmed");
    footnote = "We'll let you know the final ticket price and when the balance is due.";
  } else if (paid >= pricePence) {
    lines.push(`Ticket price: ${formatPence(pricePence)} (paid in full)`);
  } else {
    lines.push(`Ticket price: ${formatPence(pricePence)}`, `Left to pay: ${formatPence(pricePence - paid)}`);
  }

  return render({
    subject: "Payment received: Over the Hill",
    preheader: `We've received your payment of ${formatPence(amountPence)}.`,
    guestName: guest.name,
    paragraphs: [`Thanks! We've received your payment of ${formatPence(amountPence)} for Over the Hill.`],
    summary: { heading: "Your payments", lines },
    button: { label: "View your RSVP", url: guestPageUrl(guest, siteUrl) },
    footnote,
  });
}

/** From the "email me my link" form on /rsvp. */
export function inviteLinkEmail(guest: Guest, siteUrl: string): RenderedEmail {
  return render({
    subject: "Your Over the Hill invite link",
    preheader: "Here's your personal invite link for Over the Hill.",
    guestName: guest.name,
    paragraphs: [
      "Here's your personal invite link for Over the Hill. Use it to RSVP, or to update your answers any time.",
    ],
    button: { label: "Open your invite", url: new URL(`/rsvp/${guest.token}`, siteUrl).toString() },
    footnote: "This link is just for you, so please don't share it on.",
    footerReason: "You're getting this email because someone asked for your Over the Hill invite link to be sent here.",
  });
}
