import type { APIRoute } from "astro";
import { addGuest } from "../../../lib/guests";
import { inviterNamesField, textField } from "../../../lib/forms";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = textField(form, "name");

  if (!name) {
    return redirect("/admin/guests/new", 303);
  }

  await addGuest({
    name,
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    inviterNames: inviterNamesField(form, "inviterNames"),
  });

  return redirect("/admin", 303);
};
