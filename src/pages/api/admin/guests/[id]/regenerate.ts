import type { APIRoute } from "astro";
import { regenerateGuestLink } from "../../../../../lib/guests";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id;
  if (id) {
    await regenerateGuestLink(id);
  }
  return redirect("/admin", 303);
};
