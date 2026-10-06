import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  inviteLinkEmail,
  EMAIL_TEMPLATES,
  emailText,
  paymentDueEmail,
  paymentReceivedEmail,
  rsvpConfirmationEmail,
  sampleEmail,
  type RenderedEmail,
} from "../src/lib/emailContent";
import type { Guest } from "../src/lib/guests";

const SITE = "https://overthehill.live";

const guest = {
  name: 'Ada <script>alert("x")</script>',
  token: "tok-123",
  attendance: "yes",
  arrival_day: "fri",
  departure_day: "sun",
  camping: "camping",
  vehicle: "car",
  dietary: "Vegan",
  accessibility: null,
  notes: null,
  amount_paid_pence: 2000,
  registered_at: "2026-10-12T10:00:00.000Z",
} as unknown as Guest;

const emails: Record<string, RenderedEmail> = {
  "confirmation-registered": rsvpConfirmationEmail(guest, SITE),
  "confirmation-deposit": rsvpConfirmationEmail(guest, SITE, { payment: { amountPence: 2000, inFull: false } }),
  "confirmation-paid-full": rsvpConfirmationEmail(guest, SITE, { payment: { amountPence: 7500, inFull: true } }),
  "confirmation-declined": rsvpConfirmationEmail({ ...guest, attendance: "no" } as Guest, SITE),
  "deposit-due": paymentDueEmail({ ...guest, amount_paid_pence: 0, registered_at: null } as Guest, SITE, { kind: "deposit", amountPence: 2000 }),
  "ticket-due": paymentDueEmail({ ...guest, amount_paid_pence: 0, registered_at: null } as Guest, SITE, { kind: "balance", amountPence: 7500 }),
  "deposit-now-due": paymentDueEmail({ ...guest, amount_paid_pence: 0 } as Guest, SITE, { kind: "deposit", amountPence: 2000 }),
  "ticket-now-due": paymentDueEmail({ ...guest, amount_paid_pence: 0 } as Guest, SITE, { kind: "balance", amountPence: 7500 }),
  "balance-now-due": paymentDueEmail(guest, SITE, { kind: "balance", amountPence: 5500 }),
  "payment-balance": paymentReceivedEmail({ ...guest, amount_paid_pence: 6000 } as Guest, SITE, 4000, 6000),
  "payment-price-tbc": paymentReceivedEmail(guest, SITE, 2000, null),
  "invite-link": inviteLinkEmail(guest, SITE),
};

// EMAIL_PREVIEW_DIR=/some/dir npm test -- emailContent  writes each email as
// HTML for eyeballing in a browser.
const previewDir = process.env.EMAIL_PREVIEW_DIR;
if (previewDir) {
  for (const [name, email] of Object.entries(emails)) writeFileSync(join(previewDir, `${name}.html`), email.html);
}

describe("emails", () => {
  it.each(Object.entries(emails))("%s renders completely in the shared layout", (_name, email) => {
    expect(email.html).not.toMatch(/\{\{|\}\}/);
    expect(email.html).toContain("Over the Hill Festival");
    expect(email.html).toContain("<title>" + email.subject + "</title>");
    expect(email.text).toContain("Hi Ada");
  });

  it("escapes guest-supplied text", () => {
    for (const email of Object.values(emails)) {
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain("&lt;script&gt;");
    }
  });

  // Mustache escapes "/" as &#x2F; in attributes, which clients decode.
  const decoded = (html: string) => html.replaceAll("&#x2F;", "/").replaceAll("&#x3D;", "=");

  it("links each email to the right page", () => {
    expect(decoded(emails["deposit-due"].html)).toContain(`href="${SITE}/rsvp/tok-123"`);
    expect(decoded(emails["invite-link"].html)).toContain(`href="${SITE}/rsvp/tok-123"`);
    expect(emails["confirmation-deposit"].html).toMatch(/>Deposit paid<\/td>\s*<td[^>]*>£20</);
    expect(emails["confirmation-deposit"].text).toContain("Deposit paid: £20");
    expect(emails["payment-price-tbc"].text).toContain("Ticket price: to be confirmed");
    expect(emails["payment-balance"].html).toContain("(paid in full)");
  });

  it("says what's due, whether or not they're on the list yet", () => {
    expect(emails["deposit-due"].text).toContain("isn't confirmed until you've paid your £20 deposit");
    expect(emails["ticket-due"].text).toContain("isn't confirmed until you've paid for your ticket (£75)");
    expect(emails["ticket-due"].text).toContain("Pay for your ticket: £75");
    expect(emails["deposit-now-due"].subject).toBe("Your Over the Hill deposit is due");
    expect(emails["deposit-now-due"].text).not.toContain("isn't confirmed");
    expect(emails["ticket-now-due"].text).toContain("Tickets are now on sale at £75");
    expect(emails["balance-now-due"].text).toContain("Ticket price: £75");
    expect(emails["balance-now-due"].text).toContain("Left to pay: £55");
    expect(emails["confirmation-paid-full"].text).toContain("Thanks for paying for your ticket");
    expect(emails["confirmation-paid-full"].text).toContain("Paid: £75 (paid in full)");
    expect(decoded(emails["ticket-now-due"].html)).toContain(`href="${SITE}/rsvp/tok-123"`);
  });

  it("doesn't tell someone who declined we'll see them in the field", () => {
    expect(emails["confirmation-declined"].html).not.toContain("see you in the field");
    expect(emails["confirmation-declined"].html).toContain("sorry you can");
  });
});

describe("the answers in a confirmation", () => {
  it("gives arrival and departure as the day and date", () => {
    const { text } = rsvpConfirmationEmail(guest, SITE);
    expect(text).toContain("Arriving: Friday 13 August");
    expect(text).toContain("Departing: Sunday 15 August");
  });
});

describe("hosts' own wording (admin Emails)", () => {
  it("uses their subject, message and button, with placeholders filled in", () => {
    const email = paymentDueEmail({ ...guest, amount_paid_pence: 0 } as Guest, SITE, { kind: "deposit", amountPence: 2000 }, {
      "deposit-due": { subject: "Deposit time, {first_name}!", body: "Hello {first_name}.\n\nIt's {amount}, ta.", button: "Pay up" },
    });
    expect(email.subject).toBe('Deposit time, Ada!');
    expect(email.text).toContain("Hello Ada.\n\nIt's £20, ta.");
    expect(email.text).toContain("Pay up: https://overthehill.live/rsvp/tok-123");
    // what they didn't change keeps the default
    expect(email.text).toContain("You'll pay the rest once the final ticket price is confirmed");
  });

  it("falls back to the default for a blank subject, but lets small print be blank", () => {
    const t = emailText("deposit-due", { "deposit-due": { subject: "  ", footnote: "" } }, { amount: "£20" });
    expect(t.subject).toBe("Your Over the Hill deposit is due");
    expect(t.footnote).toBe("");
  });

  it("leaves an unknown placeholder as typed", () => {
    expect(emailText("invite-link", { "invite-link": { body: "Hi {nickname}" } }, { first_name: "Ada" }).body).toBe("Hi {nickname}");
  });

  it.each(EMAIL_TEMPLATES.map((t) => t.id))("previews %s with a made-up guest", (id) => {
    const email = sampleEmail(id, SITE, {});
    expect(email.html).toContain("Sam Example");
    // every placeholder filled in
    expect(`${email.subject}\n${email.text}`).not.toMatch(/\{\w+\}/);
  });
});

describe("pictures", () => {
  const html = (email: { html: string }) => email.html.replaceAll("&#x2F;", "/");
  it("come from the site that sends the email (so staging's own can be checked)", () => {
    expect(html(inviteLinkEmail(guest, "https://staging.overthehill.live"))).toContain('src="https://staging.overthehill.live/images/email-hills-butterfly.png"');
    expect(html(inviteLinkEmail(guest, SITE))).toContain('src="https://overthehill.live/images/email-hills-butterfly.png"');
  });

  it("in an admin preview, come from the site it's shown on", () => {
    expect(html(sampleEmail("invite-link", SITE, {}, {}, "http://localhost:4322"))).toContain('src="http://localhost:4322/images/email-hills-butterfly.png"');
  });
});
