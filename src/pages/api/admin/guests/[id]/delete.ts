import type { APIRoute } from "astro";
import { deleteGuest } from "../../../../../lib/guests";
import { saveGuestSongs } from "../../../../../lib/spotify";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect, locals }) => {
  const id = params.id;
  if (id) {
    // Their songs come off the playlist first (unless someone else picked
    // them too). Spotify failing doesn't stop the delete.
    try {
      await saveGuestSongs(id, [], locals.hostEmail ?? "a host");
    } catch (err) {
      console.error("Removing a deleted guest's songs failed", err);
    }
    await deleteGuest(id);
  }
  return redirect("/admin", 303);
};
