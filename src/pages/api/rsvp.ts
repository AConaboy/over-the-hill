import type { APIRoute } from "astro";
import {
  submitRsvp,
  markConfirmationEmailSent,
  canSendConfirmationEmail,
  CAMPING_VALUES,
  VEHICLE_VALUES,
} from "../../lib/guests";
import { sendRsvpConfirmationEmail } from "../../lib/email";
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

  // Non-blocking: a failed email send must never stop the RSVP from saving.
  let emailed = false;
  if (result.guest.email && canSendConfirmationEmail(result.guest)) {
    try {
      await sendRsvpConfirmationEmail(result.guest);
      await markConfirmationEmailSent(result.guest.id);
      emailed = true;
    } catch (err) {
      console.error("Failed to send RSVP confirmation email", err);
    }
  }

  return redirect(`${rsvpUrl}?submitted=1${emailed ? "&emailed=1" : ""}`, 303);
};
