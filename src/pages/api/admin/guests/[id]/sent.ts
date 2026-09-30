import type { APIRoute } from "astro";
import { markInviteSent } from "../../../../../lib/guests";

export const prerender = false;

/** Marks a guest's invite sent (sent=1) or not (sent=0). admin.js posts
 * here in the background after copying the invite message and gets JSON
 * back; the plain form buttons get sent back to the page they came from. */
export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const id = params.id;
  const form = await request.formData();
  const sent = form.get("sent") === "1";
  const how = form.get("how") === "copied" ? "copied the message" : "marked by hand";
  if (id) await markInviteSent(id, sent, locals.hostEmail ?? "a host", how);

  if (request.headers.get("accept")?.includes("application/json")) {
    return Response.json({ ok: true, sent });
  }
  const back = form.get("back");
  // only ever back into admin (never an arbitrary or //other-site URL)
  const safeBack = typeof back === "string" && /^\/admin(\/[\w\-/]*)?(\?[\w=&%\-.]*)?$/.test(back) ? back : "/admin";
  // and to the same place on it (the guest's row), not the top
  const anchor = form.get("anchor");
  const hash = typeof anchor === "string" && /^[\w-]{1,80}$/.test(anchor) ? `#${anchor}` : "";
  return redirect(safeBack + hash, 303);
};
