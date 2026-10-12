import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSendConfirmationEmail,
  canSendMagicLink,
  hasNothingToPay,
  isGuestKind,
  isGuestSort,
  isLinkExpired,
  linkExpiresAt,
  normaliseInviterNames,
} from "../src/lib/guests";

const NOW = new Date("2027-05-01T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

describe("isLinkExpired", () => {
  const past = "2027-04-01T00:00:00Z";
  const future = "2027-06-01T00:00:00Z";
  const sent = "2027-03-01T00:00:00Z";

  it("expires a sent, unanswered link past its expiry", () => {
    expect(isLinkExpired({ attendance: "pending", token_expires_at: past, invite_sent_at: sent })).toBe(true);
  });

  it("keeps a sent, unanswered link before its expiry", () => {
    expect(isLinkExpired({ attendance: "pending", token_expires_at: future, invite_sent_at: sent })).toBe(false);
  });

  it("never expires a link that hasn't been sent yet", () => {
    expect(isLinkExpired({ attendance: "pending", token_expires_at: past, invite_sent_at: null })).toBe(false);
    expect(linkExpiresAt({ attendance: "pending", token_expires_at: past, invite_sent_at: null })).toBeNull();
  });

  it("never expires once the guest has responded", () => {
    expect(isLinkExpired({ attendance: "yes", token_expires_at: past, invite_sent_at: sent })).toBe(false);
    expect(isLinkExpired({ attendance: "no", token_expires_at: past, invite_sent_at: sent })).toBe(false);
  });
});

describe("email cooldowns", () => {
  it("allows the first send", () => {
    expect(canSendMagicLink({ magic_link_sent_at: null })).toBe(true);
    expect(canSendConfirmationEmail({ confirmation_email_sent_at: null })).toBe(true);
  });

  it("blocks a repeat within 5 minutes", () => {
    expect(canSendMagicLink({ magic_link_sent_at: minutesAgo(4) })).toBe(false);
    expect(canSendConfirmationEmail({ confirmation_email_sent_at: minutesAgo(4) })).toBe(false);
  });

  it("allows a repeat after 5 minutes", () => {
    expect(canSendMagicLink({ magic_link_sent_at: minutesAgo(6) })).toBe(true);
    expect(canSendConfirmationEmail({ confirmation_email_sent_at: minutesAgo(6) })).toBe(true);
  });
});

describe("normaliseInviterNames", () => {
  it("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(normaliseInviterNames(["Andrew", " andrew ", "", "Alice", "ALICE", "  "])).toEqual([
      "Andrew",
      "Alice",
    ]);
  });
});

describe("isGuestSort", () => {
  it("only accepts the whitelisted sort keys", () => {
    expect(isGuestSort("name")).toBe(true);
    expect(isGuestSort("expiry")).toBe(true);
    expect(isGuestSort("name; drop table guests")).toBe(false);
    expect(isGuestSort("toString")).toBe(false);
    expect(isGuestSort(null)).toBe(false);
  });
});

describe("isGuestKind", () => {
  it("only accepts the whitelisted kinds", () => {
    expect(isGuestKind("performers")).toBe(true);
    expect(isGuestKind("all")).toBe(true);
    expect(isGuestKind("1=1")).toBe(false);
    expect(isGuestKind(null)).toBe(false);
  });
});

describe("hasNothingToPay", () => {
  it("is only true for a performer priced at £0", () => {
    expect(hasNothingToPay({ is_performer: 1, amount_due_pence: 0 })).toBe(true);
    expect(hasNothingToPay({ is_performer: 1, amount_due_pence: null })).toBe(false);
    expect(hasNothingToPay({ is_performer: 1, amount_due_pence: 1500 })).toBe(false);
    expect(hasNothingToPay({ is_performer: 0, amount_due_pence: 0 })).toBe(false);
  });
});
