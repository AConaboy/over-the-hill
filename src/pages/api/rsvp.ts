import type { APIRoute } from "astro";
import {
  submitRsvp,
  markConfirmationEmailSent,
  markRegistered,
  getGuestById,
  canSendConfirmationEmail,
  CAMPING_VALUES,
  VEHICLE_VALUES,
} from "../../lib/guests";
import { sendDepositDueEmail, sendRsvpConfirmationEmail } from "../../lib/email";
import { getPaymentSettings } from "../../lib/settings";
import { nextPayment } from "../../lib/payments";
import { isStripeConfigured } from "../../lib/stripe";
import { startCheckout } from "../../lib/checkout";
import { choiceField, LONG_TEXT_MAX, textField } from "../../lib/forms";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const token = textField(form, "token") ?? "";
  const rsvpUrl = `/rsvp/${encodeURIComponent(token)}`;

  // The form requires a yes/no answer; anything else is a hand-crafted
  // request, so don't save it (or email a "declining" summary for it).
  const attendance = choiceField(form, "attendance", ["yes", "no"] as const);
  if (!attendance) {
    return redirect(rsvpUrl, 303);
  }

  const result = await submitRsvp(token, {
    attendance,
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    arrivalDay: textField(form, "arrivalDay"),
    departureDay: textField(form, "departureDay"),
    camping: choiceField(form, "camping", CAMPING_VALUES),
    vehicle: choiceField(form, "vehicle", VEHICLE_VALUES),
    dietary: textField(form, "dietary", LONG_TEXT_MAX),
    accessibility: textField(form, "accessibility", LONG_TEXT_MAX),
    notes: textField(form, "notes", LONG_TEXT_MAX),
  });

  if (!result.ok) {
    // Invalid or expired token: send them back to the same URL, which will
    // render the appropriate "not found"/"expired" state on reload.
    return redirect(rsvpUrl, 303);
  }

  // Saying yes completes registration straight away only when no deposit is
  // due (deposits closed, or a free performer). Otherwise their answers are
  // saved (above) and they go straight on to pay the deposit, which is what
  // completes it — see recordPayment() in src/lib/guests.ts.
  let guest = result.guest;
  let depositDue: number | null = null;
  if (guest.attendance === "yes" && !guest.registered_at) {
    const next = nextPayment(guest, await getPaymentSettings(), isStripeConfigured());
    if (next.kind === "deposit") {
      depositDue = next.amountPence;
    } else {
      await markRegistered(guest.id);
      guest = (await getGuestById(guest.id)) ?? guest;
    }
  }

  // Non-blocking: a failed email send must never stop the RSVP from saving.
  let emailed = false;
  if (guest.email && canSendConfirmationEmail(guest)) {
    try {
      if (depositDue !== null) {
        await sendDepositDueEmail(guest, depositDue);
      } else {
        await sendRsvpConfirmationEmail(guest);
      }
      await markConfirmationEmailSent(guest.id);
      emailed = true;
    } catch (err) {
      console.error("Failed to send RSVP email", err);
    }
  }

  const submittedUrl = `${rsvpUrl}?submitted=1${emailed ? "&emailed=1" : ""}`;
  if (depositDue !== null) {
    const checkout = await startCheckout(guest);
    if (checkout.ok) return redirect(checkout.url, 303);
    // Couldn't reach Stripe: their answers are saved, and the page offers
    // the Pay deposit button to try again.
    return redirect(`${submittedUrl}${checkout.reason === "error" ? "&payerror=1" : ""}`, 303);
  }
  return redirect(submittedUrl, 303);
};
