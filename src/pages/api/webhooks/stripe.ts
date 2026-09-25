import type { APIRoute } from "astro";
import { clearCheckout, recordPayment } from "../../../lib/guests";
import { sendPaymentReceivedEmail } from "../../../lib/email";
import { getPaymentSettings } from "../../../lib/settings";
import { ticketPrice } from "../../../lib/payments";
import { getStripe, getWebhookSecret, isStripeConfigured } from "../../../lib/stripe";
import { handleStripeEvent, verifyStripeEvent } from "../../../lib/stripeWebhook";

export const prerender = false;

// Stripe posts JSON, which Astro's same-origin check doesn't apply to (it
// only guards form content types); the signature check below is what
// authenticates the request. On staging, whose Access app covers the whole
// hostname, this path needs a Bypass policy (docs/deployment.md).
export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) {
    return new Response("Payments aren't set up here.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event;
  try {
    event = await verifyStripeEvent(getStripe(), rawBody, signature, getWebhookSecret());
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const outcome = await handleStripeEvent(event, {
    recordPayment,
    clearCheckout,
    async onPaymentRecorded(guest, amountPence) {
      const settings = await getPaymentSettings();
      await sendPaymentReceivedEmail(guest, amountPence, ticketPrice(guest, settings));
    },
  });

  if (outcome === "unknown_guest") {
    // e.g. a guest deleted mid-checkout. Acknowledge anyway: a retry can't
    // succeed, and the payment is still visible in the Stripe Dashboard.
    console.error(`Stripe ${event.type} ${event.id}: no matching guest`);
  }

  return new Response(JSON.stringify({ received: true, outcome }), {
    headers: { "content-type": "application/json" },
  });
};
