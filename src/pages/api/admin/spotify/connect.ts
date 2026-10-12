import type { APIRoute } from "astro";
import { authorizeUrl, callbackUrl, isSpotifyConfigured, STATE_COOKIE } from "../../../../lib/spotify";

export const prerender = false;

// "Connect Spotify" on admin Playlist: off to Spotify's sign-in, with a
// one-off state (also in a cookie) that the callback checks, so only a
// sign-in this host started can connect an account. The address it comes
// back to must be listed in the Spotify app's settings (docs/deployment.md).
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (!isSpotifyConfigured()) return redirect("/admin/playlist", 303);
  const state = crypto.randomUUID();
  cookies.set(STATE_COOKIE, state, {
    path: "/api/admin/spotify",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
  });
  return redirect(authorizeUrl(state, callbackUrl(url.origin)), 302);
};
