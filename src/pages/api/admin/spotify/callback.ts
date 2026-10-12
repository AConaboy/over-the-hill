import type { APIRoute } from "astro";
import { callbackUrl, connectAccount, createPlaylist, getSpotifyStatus, STATE_COOKIE } from "../../../../lib/spotify";

export const prerender = false;

// Back from Spotify's sign-in: keep the account, and make the playlist if
// there isn't one yet. Any problem goes back to admin Playlist to say so.
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const expected = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/api/admin/spotify" });
  const code = url.searchParams.get("code");
  if (!expected || url.searchParams.get("state") !== expected) return redirect("/admin/playlist?problem=state", 303);
  if (!code) return redirect("/admin/playlist?problem=declined", 303);

  try {
    await connectAccount(code, callbackUrl(url.origin));
  } catch (err) {
    console.error("Connecting Spotify failed", err);
    return redirect("/admin/playlist?problem=connect", 303);
  }
  if (!(await getSpotifyStatus()).playlistId) {
    try {
      await createPlaylist();
    } catch (err) {
      console.error("Making the playlist failed", err);
      return redirect("/admin/playlist?connected=1&problem=playlist", 303);
    }
  }
  return redirect("/admin/playlist?connected=1", 303);
};
