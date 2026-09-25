// Payment rules for v2 (deposit, then balance). Pure functions only, so they
// can be unit-tested and shared by the ticket page, the pay route and admin.
// All amounts are integer pence.
//
// The final ticket price is often not known when deposits open, so a price
// of null means "not decided yet": guests can pay a deposit, and the balance
// is worked out from whatever the price is when balance payments open.

import type { Guest, PaymentStatus } from "./guests";

export interface PaymentSettings {
  depositPence: number | null;
  standardPricePence: number | null;
  depositsOpen: boolean;
  balanceOpen: boolean;
}

export type PaymentKind = "deposit" | "balance" | "manual" | "refund";

type PricedGuest = Pick<Guest, "is_performer" | "amount_due_pence">;
type PayingGuest = PricedGuest &
  Pick<Guest, "attendance" | "ticket_ref" | "status" | "amount_paid_pence">;

/** A performer's own price if set, otherwise the standard price. null means
 * the price hasn't been decided yet. */
export function ticketPrice(guest: PricedGuest, settings: PaymentSettings): number | null {
  return guest.amount_due_pence ?? settings.standardPricePence;
}

/** The deposit, capped at the guest's price when that's known, so someone
 * priced below the deposit pays everything in one go. */
export function depositFor(guest: PricedGuest, settings: PaymentSettings): number | null {
  if (settings.depositPence === null) return null;
  const price = ticketPrice(guest, settings);
  return price === null ? settings.depositPence : Math.min(settings.depositPence, price);
}

export type NothingDueReason =
  | "not_attending"
  | "cancelled"
  | "free"
  | "paid_full"
  | "deposits_closed"
  | "awaiting_price"
  | "balance_closed";

export type NextPayment =
  | { kind: "deposit" | "balance"; amountPence: number }
  | { kind: "none"; reason: NothingDueReason };

/** What (if anything) this guest can pay right now. Also used by the pay
 * route, so the amount charged is always computed here, never taken from the
 * browser. `paymentsAvailable` is false when Stripe isn't configured. */
export function nextPayment(
  guest: PayingGuest,
  settings: PaymentSettings,
  paymentsAvailable = true,
): NextPayment {
  if (guest.status === "cancelled") return { kind: "none", reason: "cancelled" };
  if (guest.attendance !== "yes" || !guest.ticket_ref) return { kind: "none", reason: "not_attending" };

  const price = ticketPrice(guest, settings);
  if (price === 0) return { kind: "none", reason: "free" };

  const paid = guest.amount_paid_pence ?? 0;

  if (paid <= 0) {
    const deposit = depositFor(guest, settings);
    if (!paymentsAvailable || !settings.depositsOpen || deposit === null || deposit <= 0) {
      return { kind: "none", reason: "deposits_closed" };
    }
    return { kind: "deposit", amountPence: deposit };
  }

  if (price === null) return { kind: "none", reason: "awaiting_price" };
  if (paid >= price) return { kind: "none", reason: "paid_full" };
  if (!paymentsAvailable || !settings.balanceOpen) return { kind: "none", reason: "balance_closed" };
  return { kind: "balance", amountPence: price - paid };
}

/** Mirrors the SQL in guests.ts (paymentStatusSql) — keep the two in step. */
export function paymentStatusFor(paidPence: number, pricePence: number | null): PaymentStatus {
  if (paidPence > 0 && pricePence !== null && paidPence >= pricePence) return "paid_full";
  if (paidPence > 0) return "deposit_paid";
  return "unpaid";
}

/** How much a guest has paid over their current price (e.g. after the price
 * was lowered), which a host should refund. 0 when not overpaid or unpriced. */
export function overpaidBy(guest: PricedGuest & Pick<Guest, "amount_paid_pence">, settings: PaymentSettings): number {
  const price = ticketPrice(guest, settings);
  if (price === null) return 0;
  return Math.max(0, (guest.amount_paid_pence ?? 0) - price);
}
