import type { APIRoute } from "astro";
import { getGuestByToken, isLinkExpired } from "../../../../lib/guests";
import { getSpotifyStatus, searchTracks, songsOpen } from "../../../../lib/spotify";
import { canPickSongs } from "../../../../lib/songs";

export const prerender = false;

// The song search on a guest's page (public/js/songs.js): what they typed,
// searched on Spotify. Only for a guest with a live link who can pick songs
// (they've paid, and hosts have songs switched on), so it's never an open
// search anyone can use. A POST, so their token stays out of URLs and logs.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const query = String(form.get("q") ?? "").trim();

  const guest = token ? await getGuestByToken(token) : null;
  if (!guest || isLinkExpired(guest) || !canPickSongs(guest)) return json({ error: "link" }, 403);
  if (!(await songsOpen(await getSpotifyStatus()))) return json({ error: "closed" }, 503);
  if (query.length < 2 || query.length > 100) return json({ tracks: [] });

  try {
    return json({ tracks: await searchTracks(query) });
  } catch (err) {
    console.error("Spotify search failed", err);
    return json({ error: "spotify" }, 502);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
