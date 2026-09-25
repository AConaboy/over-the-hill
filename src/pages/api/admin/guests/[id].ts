import type { APIRoute } from "astro";
import {
  getGuestById,
  markRegistered,
  updateGuestAsAdmin,
  ATTENDANCE_VALUES,
  CAMPING_VALUES,
  VEHICLE_VALUES,
} from "../../../../lib/guests";
import { getPaymentSettings } from "../../../../lib/settings";
import { nextPayment } from "../../../../lib/payments";
import { isStripeConfigured } from "../../../../lib/stripe";
import { choiceField, inviterNamesField, LONG_TEXT_MAX, performerFields, textField } from "../../../../lib/forms";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id;
  if (!id) {
    return redirect("/admin", 303);
  }

  const form = await request.formData();
  const name = textField(form, "name");
  // Both fields are validated in the browser too, so this only rejects
  // hand-crafted requests.
  const performer = performerFields(form);
  if (!name || !performer) {
    return redirect(`/admin/guests/${id}/edit`, 303);
  }

  await updateGuestAsAdmin(id, {
    name,
    ...performer,
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    attendance: choiceField(form, "attendance", ATTENDANCE_VALUES) ?? "pending",
    arrivalDay: textField(form, "arrivalDay"),
    departureDay: textField(form, "departureDay"),
    camping: choiceField(form, "camping", CAMPING_VALUES),
    vehicle: choiceField(form, "vehicle", VEHICLE_VALUES),
    dietary: textField(form, "dietary", LONG_TEXT_MAX),
    accessibility: textField(form, "accessibility", LONG_TEXT_MAX),
    notes: textField(form, "notes", LONG_TEXT_MAX),
    inviterNames: inviterNamesField(form, "inviterNames"),
  });

  // Same rule as a guest's own RSVP: marking someone attending registers
  // them straight away only if no deposit is due. Otherwise they need to pay
  // it (or a host records a manual payment), which completes registration.
  const updated = await getGuestById(id);
  if (updated && updated.attendance === "yes" && !updated.registered_at) {
    const next = nextPayment(updated, await getPaymentSettings(), isStripeConfigured());
    if (next.kind !== "deposit") await markRegistered(id);
  }

  return redirect("/admin", 303);
};
