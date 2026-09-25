import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  depositDueEmail,
  inviteLinkEmail,
  paymentReceivedEmail,
  rsvpConfirmationEmail,
  type RenderedEmail,
} from "../src/lib/emailContent";
import type { Guest } from "../src/lib/guests";

const SITE = "https://overthehill.live";

const guest = {
  name: 'Ada <script>alert("x")</script>',
  token: "tok-123",
  attendance: "yes",
  arrival_day: "Friday",
  departure_day: "Sunday",
  camping: "camping",
  vehicle: "car",
  dietary: "Vegan",
  accessibility: null,
  notes: null,
  amount_paid_pence: 2000,
} as unknown as Guest;

const emails: Record<string, RenderedEmail> = {
  "confirmation-registered": rsvpConfirmationEmail(guest, SITE),
  "confirmation-deposit": rsvpConfirmationEmail(guest, SITE, { depositPaidPence: 2000 }),
  "confirmation-declined": rsvpConfirmationEmail({ ...guest, attendance: "no" } as Guest, SITE),
  "deposit-due": depositDueEmail(guest, SITE, 2000),
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
    expect(email.html).toContain("OVER THE HILL FESTIVAL");
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
    expect(decoded(emails["deposit-due"].html)).toContain(`href="${SITE}/ticket/tok-123"`);
    expect(decoded(emails["invite-link"].html)).toContain(`href="${SITE}/rsvp/tok-123"`);
    expect(emails["confirmation-deposit"].html).toContain("Deposit paid: £20");
    expect(emails["payment-price-tbc"].text).toContain("Ticket price: to be confirmed");
    expect(emails["payment-balance"].html).toContain("(paid in full)");
  });

  it("doesn't tell someone who declined we'll see them in the field", () => {
    expect(emails["confirmation-declined"].html).not.toContain("see you in the field");
    expect(emails["confirmation-declined"].html).toContain("sorry you can");
  });
});
