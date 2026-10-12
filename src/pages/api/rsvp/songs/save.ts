import type { APIRoute } from "astro";
import { getGuestByToken, isLinkExpired } from "../../../../lib/guests";
import { getSpotifyStatus, saveGuestSongs, songsOpen } from "../../../../lib/spotify";
import { canPickSongs, songsFromForm } from "../../../../lib/songs";
import { textField } from "../../../../lib/forms";

export const prerender = false;

// "Save songs" on a guest's page: their whole list (up to three, in order;
// none clears them). Only once they've paid and while hosts have songs
// switched on. The picks are saved even if Spotify then fails (admin
// Playlist adds them later); a song that couldn't be found is reported.
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const token = textField(form, "token") ?? "";
  const page = `/rsvp/${encodeURIComponent(token)}`;

  const guest = token ? await getGuestByToken(token) : null;
  if (!guest || isLinkExpired(guest) || !canPickSongs(guest) || !(await songsOpen(await getSpotifyStatus()))) {
    return redirect(page, 303);
  }

  const songs = songsFromForm(form.getAll("songs").map(String));
  let result = "saved";
  try {
    const saved = await saveGuestSongs(guest.id, songs.ids);
    if (saved.dropped > 0 || songs.invalid > 0) result = "problem";
  } catch (err) {
    console.error("Saving songs failed", err);
    result = "problem";
  }
  return redirect(`${page}?songs=${result}#songs`, 303);
};
