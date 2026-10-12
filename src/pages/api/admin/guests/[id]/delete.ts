import type { APIRoute } from "astro";
import { deleteGuest } from "../../../../../lib/guests";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id;
  if (id) {
    await deleteGuest(id);
  }
  return redirect("/admin", 303);
};
