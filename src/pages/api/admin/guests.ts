import type { APIRoute } from "astro";
import { addGuest } from "../../../lib/guests";
import { inviterNamesField, performerFields, textField } from "../../../lib/forms";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const name = textField(form, "name");

  // Both fields are validated in the browser too, so this only rejects
  // hand-crafted requests.
  const performer = performerFields(form);
  if (!name || !performer) {
    return redirect("/admin/guests/new", 303);
  }

  await addGuest({
    name,
    ...performer,
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    inviterNames: inviterNamesField(form, "inviterNames"),
  });

  return redirect("/admin", 303);
};
