import type { APIRoute } from "astro";
import { submitRsvp, markConfirmationEmailSent, type Attendance, type Camping, type Vehicle } from "../../lib/guests";
import { sendRsvpConfirmationEmail } from "../../lib/email";

export const prerender = false;

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str : null;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");

  const attendanceRaw = form.get("attendance");
  const attendance: Attendance = attendanceRaw === "yes" || attendanceRaw === "no" ? attendanceRaw : "pending";

  const result = await submitRsvp(token, {
    attendance,
    email: emptyToNull(form.get("email")),
    phone: emptyToNull(form.get("phone")),
    arrivalDay: emptyToNull(form.get("arrivalDay")),
    departureDay: emptyToNull(form.get("departureDay")),
    camping: (emptyToNull(form.get("camping")) as Camping | null) ?? null,
    vehicle: (emptyToNull(form.get("vehicle")) as Vehicle | null) ?? null,
    dietary: emptyToNull(form.get("dietary")),
    accessibility: emptyToNull(form.get("accessibility")),
    notes: emptyToNull(form.get("notes")),
  });

  if (!result.ok) {
    // Invalid or expired token: send them back to the same URL, which will
    // render the appropriate "not found"/"expired" state on reload.
    return redirect(`/rsvp/${token}`, 303);
  }

  // Non-blocking: a failed email send must never stop the RSVP from saving.
  try {
    await sendRsvpConfirmationEmail(result.guest);
    await markConfirmationEmailSent(result.guest.id);
  } catch (err) {
    console.error("Failed to send RSVP confirmation email", err);
  }

  return redirect(`/rsvp/${token}?submitted=1`, 303);
};
