import type { APIRoute } from "astro";
import { clearCheckout, getGuestById, setGuestCancelled } from "../../../../../lib/guests";
import { choiceField } from "../../../../../lib/forms";
import { getStripe, isStripeConfigured } from "../../../../../lib/stripe";

export const prerender = false;

// Cancelling a place stops the guest paying (and closes any checkout they
// have open). Refunds are separate: make them in Stripe, then record them.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id ?? "";
  const guest = await getGuestById(id);
  if (!guest) return redirect("/admin", 303);

  const form = await request.formData();
  const action = choiceField(form, "action", ["cancel", "reinstate"] as const);
  if (!action) return redirect(`/admin/guests/${encodeURIComponent(id)}/edit`, 303);

  if (action === "cancel" && guest.checkout_session_id) {
    if (isStripeConfigured()) {
      try {
        await getStripe().checkout.sessions.expire(guest.checkout_session_id);
      } catch (err) {
        console.error(`Couldn't expire checkout ${guest.checkout_session_id}`, err);
      }
    }
    await clearCheckout(guest.id, guest.checkout_session_id);
  }

  await setGuestCancelled(guest.id, action === "cancel");
  return redirect(`/admin/guests/${encodeURIComponent(id)}/edit#payments`, 303);
};
