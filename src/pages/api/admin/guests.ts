import type { APIRoute } from "astro";
import { addGuest } from "../../../lib/guests";

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

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();

  if (!name) {
    return redirect("/admin/guests/new", 303);
  }

  await addGuest({
    name,
    email: emptyToNull(form.get("email")),
    phone: emptyToNull(form.get("phone")),
    inviterNames: splitInviterNames(form.get("inviterNames")),
  });

  return redirect("/admin", 303);
};
