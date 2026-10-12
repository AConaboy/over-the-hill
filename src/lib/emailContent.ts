// The words of every email the site sends, rendered into the shared layout
// (src/lib/emails/layout.html) so they all look like the website. Pure: no
// sending, no astro:env, so it can be unit-tested and previewed. Sending
// lives in src/lib/email.ts.

import Mustache from "mustache";
import layoutTemplate from "./emails/layout.html?raw";
import type { Guest } from "./guests";
import { formatPence } from "./money";
import { CAMPING_LABELS, DAY_LABELS, GLAMPING_LABELS, VEHICLE_LABELS, liftSummary } from "./answerLabels";

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
  link?: { label: string; url: string };
  footnote?: string;
  footerReason?: string;
  /** The site sending it: its pictures come from there (/images/email-*,
   * which staging lets through its sign-in so inboxes can load them). */
  siteUrl: string;
}

/** Set only while rendering an admin preview (sampleEmail), whose pictures
 * come from the site it's shown on. Rendering is synchronous, so this
 * can't leak into another email. */
let previewPictures: string | null = null;

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
  const assetBase = previewPictures ?? new URL(content.siteUrl).origin;
  const html = Mustache.render(layoutTemplate, { ...content, summary, footerReason, assetBase });

  // Plain-text alternative with the same content, for clients that prefer it.
  const text = [
    `Hi ${content.guestName},`,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.summary
      ? [`${content.summary.heading}:`, ...content.summary.lines.map((line) => `- ${line}`), ""]
      : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
    ...(content.link ? [`${content.link.label}: ${content.link.url}`, ""] : []),
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
    if (guest.arrival_day) lines.push(`Arriving: ${DAY_LABELS[guest.arrival_day] ?? guest.arrival_day}`);
    if (guest.departure_day) lines.push(`Departing: ${DAY_LABELS[guest.departure_day] ?? guest.departure_day}`);
    if (guest.camping) lines.push(`Camping: ${CAMPING_LABELS[guest.camping] ?? guest.camping}`);
    if (guest.vehicle) lines.push(`Vehicle: ${VEHICLE_LABELS[guest.vehicle] ?? guest.vehicle}`);
    const lift = liftSummary(guest);
    if (lift) lines.push(`Lift share: ${lift}`);
    if (guest.glamping) lines.push(`Glamping pod: ${GLAMPING_LABELS[guest.glamping] ?? guest.glamping} (not a booking)`);
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

/** The festival as a calendar file (src/pages/rsvp/[token]/calendar.ics.ts). */
export function calendarUrl(guest: Guest, siteUrl: string): string {
  return new URL(`/rsvp/${guest.token}/calendar.ics`, siteUrl).toString();
}

/** The payment that completed someone's registration: a deposit, or the
 * whole price when there's no deposit. */
export interface RegisteringPayment {
  amountPence: number;
  inFull: boolean;
}

// --- Editable wording ---
//
// Each email's words are a template hosts can change in admin (Emails),
// with {placeholders} filled in when it's sent. The defaults below are used
// for anything a host hasn't changed. What can't be edited is what the code
// works out: their answers, amounts and links.

export interface EmailText {
  subject: string;
  /** The inbox preview line. */
  preheader: string;
  /** Paragraphs, separated by a blank line. */
  body: string;
  summaryHeading: string;
  button: string;
  link: string;
  footnote: string;
}
export type EmailField = keyof EmailText;

export const EMAIL_IDS = [
  "confirmation", "confirmation-deposit", "confirmation-paid", "declined",
  "complete-deposit", "complete-ticket",
  "deposit-due", "ticket-due", "balance-due",
  "payment-received", "invite-link",
] as const;
export type EmailId = (typeof EMAIL_IDS)[number];

export interface EmailTemplate {
  id: EmailId;
  label: string;
  /** When it's sent, for hosts. */
  when: string;
  /** The fields this email uses, with how admin labels them. */
  fields: Partial<Record<EmailField, string>>;
  placeholders: string[];
  defaults: Partial<EmailText>;
}

/** Overrides saved in admin, by email; blank or missing means the default. */
export type EmailTexts = Partial<Record<EmailId, Partial<EmailText>>>;

const NAME_PLACEHOLDERS = ["{first_name}", "{name}"];
const ANSWER_FIELDS = { subject: "Subject", preheader: "Inbox preview line", body: "Message", summaryHeading: "Heading over their answers", button: "Button", link: "Calendar link", footnote: "Small print at the end" };
const PAY_FIELDS = { subject: "Subject", preheader: "Inbox preview line", body: "Message", summaryHeading: "Heading over what to pay", button: "Button", footnote: "Small print at the end" };
const CHANGE_ANY_TIME = "Plans change? No problem. Just use the same link any time to update your answers, as often as you like.";
const SEE_YOU = "You're registered for Over the Hill! We can't wait to see you in the field.";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "confirmation",
    label: "You're registered",
    when: "A guest says yes and nothing is due (payments closed), or a host marks them attending.",
    fields: ANSWER_FIELDS,
    placeholders: NAME_PLACEHOLDERS,
    defaults: {
      subject: "Your Over the Hill RSVP",
      preheader: "You're registered. Here's what we've got down for you, and a link to your RSVP.",
      body: `Thanks for letting us know your plans. ${SEE_YOU}`,
      summaryHeading: "Here's what we've got down for you",
      button: "View your RSVP",
      link: "Add it to your calendar",
      footnote: CHANGE_ANY_TIME,
    },
  },
  {
    id: "confirmation-deposit",
    label: "You're registered (deposit paid)",
    when: "Paying the deposit is what put them on the list.",
    fields: ANSWER_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Your Over the Hill RSVP",
      preheader: "You're registered. Here's what we've got down for you, and a link to your RSVP.",
      body: `Thanks for paying your deposit. ${SEE_YOU}`,
      summaryHeading: "Here's what we've got down for you",
      button: "View your RSVP",
      link: "Add it to your calendar",
      footnote: CHANGE_ANY_TIME,
    },
  },
  {
    id: "confirmation-paid",
    label: "You're registered (paid in full)",
    when: "Paying for their ticket in one go (no deposit) is what put them on the list.",
    fields: ANSWER_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Your Over the Hill RSVP",
      preheader: "You're registered. Here's what we've got down for you, and a link to your RSVP.",
      body: `Thanks for paying for your ticket. ${SEE_YOU}`,
      summaryHeading: "Here's what we've got down for you",
      button: "View your RSVP",
      link: "Add it to your calendar",
      footnote: CHANGE_ANY_TIME,
    },
  },
  {
    id: "declined",
    label: "Sorry to miss you",
    when: "A guest says they can't come.",
    fields: { subject: "Subject", preheader: "Inbox preview line", body: "Message", summaryHeading: "Heading over their answers", button: "Button", footnote: "Small print at the end" },
    placeholders: NAME_PLACEHOLDERS,
    defaults: {
      subject: "Your Over the Hill RSVP",
      preheader: "Thanks for letting us know. Here's a link if your plans change.",
      body: "Thanks for letting us know. We're sorry you can't make it this time, and we'll miss you.",
      summaryHeading: "Here's what we've got down for you",
      button: "View or update your RSVP",
      footnote: CHANGE_ANY_TIME,
    },
  },
  {
    id: "complete-deposit",
    label: "Complete your registration (deposit)",
    when: "A guest says yes while deposits are open, before they've paid it.",
    fields: PAY_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Complete your Over the Hill registration",
      preheader: "Your answers are saved. Pay your {amount} deposit to confirm your place.",
      body: "Thanks! We've saved your RSVP answers.\n\nYour place isn't confirmed until you've paid your {amount} deposit. You can pay (and update your answers) from your RSVP page.",
      summaryHeading: "Still to do",
      button: "Pay your deposit",
      footnote: "Once it's paid, your place is confirmed and we'll email you to say so.",
    },
  },
  {
    id: "complete-ticket",
    label: "Complete your registration (ticket)",
    when: "A guest says yes while full payments are open (no deposit), before they've paid.",
    fields: PAY_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Complete your Over the Hill registration",
      preheader: "Your answers are saved. Pay for your ticket ({amount}) to confirm your place.",
      body: "Thanks! We've saved your RSVP answers.\n\nYour place isn't confirmed until you've paid for your ticket ({amount}). You can pay (and update your answers) from your RSVP page.",
      summaryHeading: "Still to do",
      button: "Pay for your ticket",
      footnote: "Once it's paid, your place is confirmed and we'll email you to say so.",
    },
  },
  {
    id: "deposit-due",
    label: "Your deposit is due",
    when: "Hosts press \"Email guests\" on Payments while deposits are open: guests already on the list who haven't paid.",
    fields: PAY_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Your Over the Hill deposit is due",
      preheader: "We're now taking deposits: yours is {amount}.",
      body: "Thanks again for saying you're coming to Over the Hill!\n\nWe're now taking deposits. Please pay your {amount} deposit from your RSVP page.",
      summaryHeading: "Still to do",
      button: "Pay your deposit",
      footnote: "You'll pay the rest once the final ticket price is confirmed. We'll let you know.",
    },
  },
  {
    id: "ticket-due",
    label: "Time to pay for your ticket",
    when: "Hosts press \"Email guests\" on Payments with full payments open: guests on the list who've paid nothing.",
    fields: PAY_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Time to pay for your Over the Hill ticket",
      preheader: "Tickets are {amount}.",
      body: "Thanks again for saying you're coming to Over the Hill!\n\nTickets are now on sale at {amount}. Please pay for yours from your RSVP page.",
      summaryHeading: "Still to do",
      button: "Pay for your ticket",
      footnote: "",
    },
  },
  {
    id: "balance-due",
    label: "Time to pay the rest",
    when: "Hosts press \"Email guests\" on Payments with balance payments open: guests who've paid a deposit.",
    fields: PAY_FIELDS,
    placeholders: [...NAME_PLACEHOLDERS, "{amount}", "{price}", "{paid}"],
    defaults: {
      subject: "Time to pay the rest of your Over the Hill ticket",
      preheader: "The final ticket price is set: {amount} left to pay.",
      body: "Thanks again for saying you're coming to Over the Hill!\n\nThe final ticket price is set, so please pay the rest of your ticket ({amount}) from your RSVP page.",
      summaryHeading: "Still to do",
      button: "Pay for your ticket",
      footnote: "",
    },
  },
  {
    id: "payment-received",
    label: "Payment received",
    when: "Any payment after the one that put them on the list (usually the balance).",
    fields: { subject: "Subject", preheader: "Inbox preview line", body: "Message", summaryHeading: "Heading over their payments", button: "Button", footnote: "Small print (only while the ticket price isn't set)" },
    placeholders: [...NAME_PLACEHOLDERS, "{amount}"],
    defaults: {
      subject: "Payment received: Over the Hill",
      preheader: "We've received your payment of {amount}.",
      body: "Thanks! We've received your payment of {amount} for Over the Hill.",
      summaryHeading: "Your payments",
      button: "View your RSVP",
      footnote: "We'll let you know the final ticket price and when the balance is due.",
    },
  },
  {
    id: "invite-link",
    label: "Your invite link",
    when: "Someone uses \"email me my link\" on the RSVP page.",
    fields: { subject: "Subject", preheader: "Inbox preview line", body: "Message", button: "Button", footnote: "Small print at the end" },
    placeholders: NAME_PLACEHOLDERS,
    defaults: {
      subject: "Your Over the Hill invite link",
      preheader: "Here's your personal invite link for Over the Hill.",
      body: "Here's your personal invite link for Over the Hill. Use it to RSVP, or to update your answers any time.",
      button: "Open your invite",
      footnote: "This link is just for you, so please don't share it on.",
    },
  },
];

export function emailTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((template) => template.id === id);
}

/** The words for one email: the hosts' version of each field if they've
 * written one, else the default, with {placeholders} filled in. A subject,
 * message or button can't be blank (it falls back to the default); the
 * small print can be, to leave it out. */
export function emailText(id: EmailId, texts: EmailTexts, vars: Record<string, string>): EmailText {
  const template = emailTemplate(id)!;
  const saved = texts[id] ?? {};
  const fill = (value: string) => value.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
  const field = (name: EmailField, required: boolean) => {
    const own = saved[name];
    const value = own !== undefined && (own.trim() !== "" || !required) ? own : (template.defaults[name] ?? "");
    return fill(value.trim());
  };
  return {
    subject: field("subject", true),
    preheader: field("preheader", false),
    body: field("body", true),
    summaryHeading: field("summaryHeading", true),
    button: field("button", true),
    link: field("link", true),
    footnote: field("footnote", false),
  };
}

function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
}

function nameVars(guest: Guest): Record<string, string> {
  return { name: guest.name, first_name: guest.name.trim().split(/\s+/)[0] || guest.name };
}

/** "You're registered" (or "sorry to miss you"), with their answers. When
 * a payment is what completed registration, it says so and lists it. */
export function rsvpConfirmationEmail(
  guest: Guest,
  siteUrl: string,
  options: { payment?: RegisteringPayment } = {},
  texts: EmailTexts = {},
): RenderedEmail {
  const attending = guest.attendance === "yes";
  const { payment } = options;
  const id: EmailId = !attending ? "declined" : !payment ? "confirmation" : payment.inFull ? "confirmation-paid" : "confirmation-deposit";
  const t = emailText(id, texts, { ...nameVars(guest), amount: payment ? formatPence(payment.amountPence) : "" });
  const lines = summariseAnswers(guest);
  if (payment) {
    lines.push(payment.inFull ? `Paid: ${formatPence(payment.amountPence)} (paid in full)` : `Deposit paid: ${formatPence(payment.amountPence)}`);
  }

  return render({
    siteUrl,
    subject: t.subject,
    preheader: t.preheader,
    guestName: guest.name,
    paragraphs: paragraphs(t.body),
    summary: { heading: t.summaryHeading, lines },
    button: { label: t.button, url: guestPageUrl(guest, siteUrl) },
    link: attending ? { label: t.link, url: calendarUrl(guest, siteUrl) } : undefined,
    footnote: t.footnote || undefined,
  });
}

/** Something to pay now (from nextPayment): the deposit, the balance, or
 * the whole price when there's no deposit. Sent when they say yes and
 * payment is what completes their registration, and by hosts from admin
 * Payments when payments open for guests already on the list. */
export function paymentDueEmail(
  guest: Guest,
  siteUrl: string,
  due: { kind: "deposit" | "balance"; amountPence: number },
  texts: EmailTexts = {},
): RenderedEmail {
  const amount = formatPence(due.amountPence);
  const paid = guest.amount_paid_pence ?? 0;
  const id: EmailId = !guest.registered_at
    ? (due.kind === "deposit" ? "complete-deposit" : "complete-ticket")
    : due.kind === "deposit" ? "deposit-due" : paid > 0 ? "balance-due" : "ticket-due";
  const t = emailText(id, texts, {
    ...nameVars(guest),
    amount,
    price: formatPence(paid + due.amountPence),
    paid: formatPence(paid),
  });
  const lines =
    id === "balance-due"
      ? [`Ticket price: ${formatPence(paid + due.amountPence)}`, `Paid so far: ${formatPence(paid)}`, `Left to pay: ${amount}`]
      : id === "ticket-due"
        ? [`Ticket price: ${amount}`]
        : [`${due.kind === "deposit" ? "Pay your deposit" : "Pay for your ticket"}: ${amount}`];

  return render({
    siteUrl,
    subject: t.subject,
    preheader: t.preheader,
    guestName: guest.name,
    paragraphs: paragraphs(t.body),
    summary: { heading: t.summaryHeading, lines },
    button: { label: t.button, url: guestPageUrl(guest, siteUrl) },
    footnote: t.footnote || undefined,
  });
}

/** A receipt for any payment after the one that completed registration
 * (e.g. the balance). `pricePence` is null while the price isn't set. */
export function paymentReceivedEmail(
  guest: Guest,
  siteUrl: string,
  amountPence: number,
  pricePence: number | null,
  texts: EmailTexts = {},
): RenderedEmail {
  const t = emailText("payment-received", texts, { ...nameVars(guest), amount: formatPence(amountPence) });
  const paid = guest.amount_paid_pence ?? 0;
  const lines = [`This payment: ${formatPence(amountPence)}`, `Paid so far: ${formatPence(paid)}`];
  if (pricePence === null) {
    lines.push("Ticket price: to be confirmed");
  } else if (paid >= pricePence) {
    lines.push(`Ticket price: ${formatPence(pricePence)} (paid in full)`);
  } else {
    lines.push(`Ticket price: ${formatPence(pricePence)}`, `Left to pay: ${formatPence(pricePence - paid)}`);
  }

  return render({
    siteUrl,
    subject: t.subject,
    preheader: t.preheader,
    guestName: guest.name,
    paragraphs: paragraphs(t.body),
    summary: { heading: t.summaryHeading, lines },
    button: { label: t.button, url: guestPageUrl(guest, siteUrl) },
    // the small print only applies while the price isn't set
    footnote: pricePence === null ? t.footnote || undefined : undefined,
  });
}

/** From the "email me my link" form on /rsvp. */
export function inviteLinkEmail(guest: Guest, siteUrl: string, texts: EmailTexts = {}): RenderedEmail {
  const t = emailText("invite-link", texts, nameVars(guest));
  return render({
    siteUrl,
    subject: t.subject,
    preheader: t.preheader,
    guestName: guest.name,
    paragraphs: paragraphs(t.body),
    button: { label: t.button, url: new URL(`/rsvp/${guest.token}`, siteUrl).toString() },
    footnote: t.footnote || undefined,
    footerReason: "You're getting this email because someone asked for your Over the Hill invite link to be sent here.",
  });
}

// --- Previews (admin Emails) ---

/** A made-up guest for previews and test emails. */
const SAMPLE_GUEST = {
  id: "sample",
  name: "Sam Example",
  token: "example-link",
  attendance: "yes",
  arrival_day: "fri",
  departure_day: "sun",
  camping: "camping",
  vehicle: "car",
  dietary: "Vegetarian",
  accessibility: null,
  notes: null,
  lift: "need",
  lift_from: "Bristol",
  lift_seats: null,
  glamping: "interested",
  amount_paid_pence: 0,
  registered_at: "2026-10-12T10:00:00.000Z",
} as unknown as Guest;

/** Each email as a guest would get it, filled in with a made-up guest and
 * example amounts (a £20 deposit and £75 ticket, unless given). */
export function sampleEmail(
  id: EmailId,
  siteUrl: string,
  texts: EmailTexts,
  amounts: { depositPence?: number | null; pricePence?: number | null } = {},
  /** Where the pictures come from: for a preview, the site it's shown on. */
  pictures: string = siteUrl,
): RenderedEmail {
  previewPictures = pictures;
  try {
    return sampleFor(id, siteUrl, texts, amounts);
  } finally {
    previewPictures = null;
  }
}

function sampleFor(
  id: EmailId,
  siteUrl: string,
  texts: EmailTexts,
  amounts: { depositPence?: number | null; pricePence?: number | null },
): RenderedEmail {
  const deposit = amounts.depositPence || 2000;
  const price = amounts.pricePence || 7500;
  const guest = (overrides: Partial<Guest>) => ({ ...SAMPLE_GUEST, ...overrides }) as Guest;
  switch (id) {
    case "confirmation":
      return rsvpConfirmationEmail(SAMPLE_GUEST, siteUrl, {}, texts);
    case "confirmation-deposit":
      return rsvpConfirmationEmail(guest({ amount_paid_pence: deposit }), siteUrl, { payment: { amountPence: deposit, inFull: false } }, texts);
    case "confirmation-paid":
      return rsvpConfirmationEmail(guest({ amount_paid_pence: price }), siteUrl, { payment: { amountPence: price, inFull: true } }, texts);
    case "declined":
      return rsvpConfirmationEmail(guest({ attendance: "no" }), siteUrl, {}, texts);
    case "complete-deposit":
      return paymentDueEmail(guest({ registered_at: null }), siteUrl, { kind: "deposit", amountPence: deposit }, texts);
    case "complete-ticket":
      return paymentDueEmail(guest({ registered_at: null }), siteUrl, { kind: "balance", amountPence: price }, texts);
    case "deposit-due":
      return paymentDueEmail(SAMPLE_GUEST, siteUrl, { kind: "deposit", amountPence: deposit }, texts);
    case "ticket-due":
      return paymentDueEmail(SAMPLE_GUEST, siteUrl, { kind: "balance", amountPence: price }, texts);
    case "balance-due":
      return paymentDueEmail(guest({ amount_paid_pence: deposit }), siteUrl, { kind: "balance", amountPence: price - deposit }, texts);
    case "payment-received":
      return paymentReceivedEmail(guest({ amount_paid_pence: price }), siteUrl, price - deposit, price, texts);
    case "invite-link":
      return inviteLinkEmail(SAMPLE_GUEST, siteUrl, texts);
  }
}
