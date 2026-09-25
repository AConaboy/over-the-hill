import { describe, expect, it } from "vitest";
import { depositFor, nextPayment, overpaidBy, paymentStatusFor, ticketPrice, type PaymentSettings } from "../src/lib/payments";
import { paymentSettingsProblem } from "../src/lib/settings";

const open: PaymentSettings = { depositPence: 2000, standardPricePence: null, depositsOpen: true, balanceOpen: false };

function guest(overrides: Record<string, unknown> = {}) {
  return {
    attendance: "yes" as const,
    ticket_ref: "ABC12345",
    status: "rsvp_yes" as const,
    is_performer: 0,
    amount_due_pence: null as number | null,
    amount_paid_pence: 0 as number | null,
    ...overrides,
  };
}

describe("ticketPrice / depositFor", () => {
  it("uses a performer's own price over the standard price", () => {
    const settings = { ...open, standardPricePence: 6000 };
    expect(ticketPrice(guest(), settings)).toBe(6000);
    expect(ticketPrice(guest({ is_performer: 1, amount_due_pence: 1500 }), settings)).toBe(1500);
  });

  it("allows a deposit before the price is decided", () => {
    expect(ticketPrice(guest(), open)).toBeNull();
    expect(depositFor(guest(), open)).toBe(2000);
  });

  it("caps the deposit at a lower price", () => {
    expect(depositFor(guest({ is_performer: 1, amount_due_pence: 1200 }), open)).toBe(1200);
  });
});

describe("nextPayment", () => {
  it("offers the deposit to an attending guest who hasn't paid", () => {
    expect(nextPayment(guest(), open)).toEqual({ kind: "deposit", amountPence: 2000 });
  });

  it("offers nothing when deposits are closed or Stripe isn't configured", () => {
    expect(nextPayment(guest(), { ...open, depositsOpen: false })).toEqual({ kind: "none", reason: "deposits_closed" });
    expect(nextPayment(guest(), open, false)).toEqual({ kind: "none", reason: "deposits_closed" });
  });

  it("waits for a price after the deposit", () => {
    expect(nextPayment(guest({ amount_paid_pence: 2000 }), { ...open, balanceOpen: true })).toEqual({
      kind: "none",
      reason: "awaiting_price",
    });
  });

  it("offers the balance from the current price once balance payments open", () => {
    const priced = { ...open, standardPricePence: 7500 };
    const paidDeposit = guest({ amount_paid_pence: 2000 });
    expect(nextPayment(paidDeposit, priced)).toEqual({ kind: "none", reason: "balance_closed" });
    expect(nextPayment(paidDeposit, { ...priced, balanceOpen: true })).toEqual({ kind: "balance", amountPence: 5500 });
  });

  it("treats a price lowered below what's paid as paid in full", () => {
    const settings = { ...open, standardPricePence: 1500, balanceOpen: true };
    expect(nextPayment(guest({ amount_paid_pence: 2000 }), settings)).toEqual({ kind: "none", reason: "paid_full" });
  });

  it("offers the deposit again after a full refund", () => {
    expect(nextPayment(guest({ amount_paid_pence: 0 }), open)).toEqual({ kind: "deposit", amountPence: 2000 });
  });

  it("never offers payment to cancelled, non-attending or free guests", () => {
    expect(nextPayment(guest({ status: "cancelled" }), open)).toEqual({ kind: "none", reason: "cancelled" });
    expect(nextPayment(guest({ attendance: "no" }), open)).toEqual({ kind: "none", reason: "not_attending" });
    expect(nextPayment(guest({ ticket_ref: null }), open)).toEqual({ kind: "none", reason: "not_attending" });
    expect(nextPayment(guest({ is_performer: 1, amount_due_pence: 0 }), open)).toEqual({ kind: "none", reason: "free" });
  });
});

describe("paymentStatusFor / overpaidBy", () => {
  it("derives status from paid and price", () => {
    expect(paymentStatusFor(0, 6000)).toBe("unpaid");
    expect(paymentStatusFor(2000, null)).toBe("deposit_paid");
    expect(paymentStatusFor(2000, 6000)).toBe("deposit_paid");
    expect(paymentStatusFor(6000, 6000)).toBe("paid_full");
  });

  it("reports overpayment against the current price only", () => {
    expect(overpaidBy(guest({ amount_paid_pence: 2000 }), { ...open, standardPricePence: 1500 })).toBe(500);
    expect(overpaidBy(guest({ amount_paid_pence: 2000 }), open)).toBe(0);
  });
});

describe("paymentSettingsProblem", () => {
  const closed: PaymentSettings = { depositPence: null, standardPricePence: null, depositsOpen: false, balanceOpen: false };

  it("allows saving amounts without Stripe while closed", () => {
    expect(paymentSettingsProblem({ ...closed, depositPence: 2000 }, false)).toBeNull();
  });

  it("refuses to open payments without Stripe or the amounts they need", () => {
    expect(paymentSettingsProblem(open, false)).toMatch(/Stripe/);
    expect(paymentSettingsProblem({ ...closed, depositsOpen: true }, true)).toMatch(/deposit amount/);
    expect(paymentSettingsProblem({ ...open, balanceOpen: true }, true)).toMatch(/ticket price/);
  });

  it("refuses a deposit above the price", () => {
    expect(paymentSettingsProblem({ ...closed, depositPence: 5000, standardPricePence: 4000 }, true)).toMatch(/more than/);
  });
});
