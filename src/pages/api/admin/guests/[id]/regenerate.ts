import type { APIRoute } from "astro";
import { regenerateGuestLink } from "../../../../../lib/guests";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const id = params.id;
  if (id) {
    await regenerateGuestLink(id, locals.hostEmail ?? "a host");
  }
  return redirect("/admin", 303);
};
