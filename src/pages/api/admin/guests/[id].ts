import type { APIRoute } from "astro";
import { updateGuestAsAdmin, type Attendance, type Camping, type Vehicle } from "../../../../lib/guests";

export const prerender = false;

function splitInviterNames(value: FormDataEntryValue | null): string[] {
  const str = typeof value === "string" ? value : "";
  return str
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str : null;
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id;
  if (!id) {
    return redirect("/admin", 303);
  }

  const form = await request.formData();
  const attendanceRaw = form.get("attendance");
  const attendance: Attendance =
    attendanceRaw === "yes" || attendanceRaw === "no" ? attendanceRaw : "pending";

  await updateGuestAsAdmin(id, {
    name: String(form.get("name") ?? "").trim(),
    email: emptyToNull(form.get("email")),
    phone: emptyToNull(form.get("phone")),
    attendance,
    arrivalDay: emptyToNull(form.get("arrivalDay")),
    departureDay: emptyToNull(form.get("departureDay")),
    camping: (emptyToNull(form.get("camping")) as Camping | null) ?? null,
    vehicle: (emptyToNull(form.get("vehicle")) as Vehicle | null) ?? null,
    dietary: emptyToNull(form.get("dietary")),
    accessibility: emptyToNull(form.get("accessibility")),
    notes: emptyToNull(form.get("notes")),
    inviterNames: splitInviterNames(form.get("inviterNames")),
  });

  return redirect("/admin", 303);
};
