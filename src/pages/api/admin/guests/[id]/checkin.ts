import type { APIRoute } from "astro";
import { setCheckedIn } from "../../../../../lib/guests";

export const prerender = false;

/** Checks a guest in at the gate (checkin=1) or undoes it (checkin=0), then
 * goes back to the check-in page it came from. */
export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const id = params.id;
  const form = await request.formData();
  if (id) await setCheckedIn(id, form.get("checkin") === "1", locals.hostEmail ?? "a host");
  const back = form.get("back");
  const safeBack =
    typeof back === "string" && /^\/(admin\/checkin|checkin\/[A-Za-z0-9-]+)(\?[\w=&%+\-.]*)?$/.test(back) ? back : "/admin/checkin";
  return redirect(safeBack, 303);
};
