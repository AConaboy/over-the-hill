// Stripe webhook handling, kept free of astro:env and database imports (the
// route passes those in as `deps`) so it can be unit-tested with signed test
// events. See src/pages/api/webhooks/stripe.ts for the route.

import Stripe from "stripe";
import type { Guest, RecordPaymentInput, RecordPaymentResult } from "./guests";

export interface WebhookDeps {
  recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult>;
  clearCheckout(guestId: string, sessionId: string): Promise<void>;
  /** Called once per newly recorded payment (never for a repeat delivery). */
  onPaymentRecorded(guest: Guest, amountPence: number): Promise<void>;
}

/** Throws if the signature doesn't match. Uses Web Crypto, which is what's
 * available on Cloudflare Workers. */
export async function verifyStripeEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  secret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
}

export type WebhookOutcome =
  | "recorded"
  | "duplicate"
  | "pending"
  | "checkout_cleared"
  | "unknown_guest"
  | "ignored";

function guestIdOf(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.guest_id ?? null;
}

async function recordSessionPayment(session: Stripe.Checkout.Session, deps: WebhookDeps): Promise<WebhookOutcome> {
  const guestId = guestIdOf(session);
  if (!guestId || session.amount_total === null) return "unknown_guest";

  const kind = session.metadata?.kind === "balance" ? "balance" : "deposit";
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  const result = await deps.recordPayment({
    id: session.id,
    guestId,
    kind,
    amountPence: session.amount_total,
    stripeRef: paymentIntent,
  });

  if (!result.recorded) return result.reason === "duplicate" ? "duplicate" : "unknown_guest";

  // Non-blocking, like the RSVP confirmation: the payment is already saved.
  try {
    await deps.onPaymentRecorded(result.guest, session.amount_total);
  } catch (err) {
    console.error("Failed to send payment email", err);
  }
  return "recorded";
}

/** Money is only recorded once Stripe says the session is paid: straight
 * away for cards, or via async_payment_succeeded for methods that settle
 * later. Until then the guest's checkout stays "open", so they can't start a
 * second payment while one is pending. */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      return session.payment_status === "paid" ? recordSessionPayment(session, deps) : "pending";
    }
    case "checkout.session.async_payment_succeeded":
      return recordSessionPayment(event.data.object, deps);
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object;
      const guestId = guestIdOf(session);
      if (!guestId) return "unknown_guest";
      await deps.clearCheckout(guestId, session.id);
      return "checkout_cleared";
    }
    default:
      return "ignored";
  }
}
