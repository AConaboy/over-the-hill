import Stripe from "stripe";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "astro:env/server";

// Stripe keys are per environment (Worker secrets; see docs/deployment.md).
// Use a restricted key (rk_...) with write access to Checkout Sessions only.
// Without both keys, payments can't be opened and the webhook returns 503.

export function isStripeConfigured(): boolean {
  return Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | undefined;

/** One client per Worker instance. The SDK's workerd build talks to Stripe
 * over fetch, and pins its own API version (2026-08-26.dahlia for 22.x). */
export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY isn't set");
  client ??= new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  return client;
}

export function getWebhookSecret(): string {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET isn't set");
  return STRIPE_WEBHOOK_SECRET;
}

// Tags our sessions in the Stripe Dashboard, so this flow can be told apart
// from any other (Stripe asks for a label ending in 8 random letters).
export const CHECKOUT_INTEGRATION_ID = "over_the_hill_tickets_kqvhmtzr";
