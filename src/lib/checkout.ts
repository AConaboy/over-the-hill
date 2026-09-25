import { SITE_URL } from "astro:env/server";
import { claimCheckout, clearCheckout, getGuestById, type Guest } from "./guests";
import { getPaymentSettings } from "./settings";
import { nextPayment } from "./payments";
import { CHECKOUT_INTEGRATION_ID, getStripe, isStripeConfigured } from "./stripe";

// Starting (or resuming) a guest's Stripe checkout. Shared by the Pay
// button (/api/pay/[token]) and the RSVP submit, which sends a guest straight
// to their deposit so paying is part of registering.

// Stripe's minimum session lifetime is 30 minutes; a minute's margin keeps
// us clear of it.
const CHECKOUT_LIFETIME_SECONDS = 31 * 60;

export type StartCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "nothing_due" | "error" };

function isLive(guest: Guest): boolean {
  return Boolean(
    guest.checkout_session_id &&
      guest.checkout_expires_at &&
      new Date(guest.checkout_expires_at).getTime() > Date.now(),
  );
}

async function expireSession(sessionId: string): Promise<void> {
  try {
    await getStripe().checkout.sessions.expire(sessionId);
  } catch (err) {
    // Already completed or expired: nothing left to stop.
    console.error(`Couldn't expire checkout ${sessionId}`, err);
  }
}

/** The amount always comes from nextPayment(), never from a request, and
 * each guest has at most one payable checkout at a time — see
 * claimCheckout() in src/lib/guests.ts. */
export async function startCheckout(guest: Guest): Promise<StartCheckoutResult> {
  if (!isStripeConfigured()) return { ok: false, reason: "nothing_due" };

  const next = nextPayment(guest, await getPaymentSettings());
  if (next.kind === "none") return { ok: false, reason: "nothing_due" };

  if (isLive(guest)) {
    // Same payment already under way (another tab, a double click, or a
    // completed payment whose webhook hasn't landed yet): send them back to
    // it rather than opening a second one they could also pay.
    if (guest.checkout_amount_pence === next.amountPence && guest.checkout_session_url) {
      return { ok: true, url: guest.checkout_session_url };
    }
    // The amount has changed since (e.g. the price was set): retire it.
    await expireSession(guest.checkout_session_id!);
    await clearCheckout(guest.id, guest.checkout_session_id!);
  }

  const ticketPath = `/ticket/${encodeURIComponent(guest.token)}`;
  let session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: next.amountPence,
            product_data: {
              name: next.kind === "deposit" ? "Over the Hill ticket: deposit" : "Over the Hill ticket: balance",
            },
          },
        },
      ],
      client_reference_id: guest.ticket_ref ?? undefined,
      metadata: { guest_id: guest.id, kind: next.kind },
      payment_intent_data: { metadata: { guest_id: guest.id, kind: next.kind } },
      customer_email: guest.email ?? undefined,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_SECONDS,
      success_url: new URL(`${ticketPath}?paid=1`, SITE_URL).toString(),
      cancel_url: new URL(ticketPath, SITE_URL).toString(),
      integration_identifier: CHECKOUT_INTEGRATION_ID,
    });
  } catch (err) {
    console.error("Couldn't create a Stripe checkout", err);
    return { ok: false, reason: "error" };
  }

  if (!session.url) return { ok: false, reason: "error" };

  const claimed = await claimCheckout(guest.id, {
    sessionId: session.id,
    url: session.url,
    amountPence: next.amountPence,
    expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  });

  if (!claimed) {
    // Another request claimed a checkout between our check and now. Retire
    // ours so only the winner can be paid, and send them to that one.
    await expireSession(session.id);
    const current = await getGuestById(guest.id);
    return current?.checkout_session_url ? { ok: true, url: current.checkout_session_url } : { ok: false, reason: "error" };
  }

  return { ok: true, url: session.url };
}
