import type { APIRoute } from "astro";
import { updateGuestAsAdmin, ATTENDANCE_VALUES, CAMPING_VALUES, VEHICLE_VALUES } from "../../../../lib/guests";
import { choiceField, inviterNamesField, LONG_TEXT_MAX, textField } from "../../../../lib/forms";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id;
  if (!id) {
    return redirect("/admin", 303);
  }

  const form = await request.formData();
  const name = textField(form, "name");
  if (!name) {
    return redirect(`/admin/guests/${id}/edit`, 303);
  }

  await updateGuestAsAdmin(id, {
    name,
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

  return redirect("/admin", 303);
};
