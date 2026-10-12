import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from "astro:env/server";
import { getDb } from "./db";
import { eventStatement } from "./guests";
import { mapSearchResponse, mapTrack, planSongChanges, songLabel, trackUri, type SongPick, type Track } from "./songs";

// The communal playlist. A host connects their Spotify account once (admin
// Spotify); the site keeps its refresh token (migrations/0021) and, as that
// account, searches for guests, makes the playlist and adds their picks.
// Guests never sign in to Spotify.
//
// Spotify's app keys are per environment (Worker secrets, see
// docs/deployment.md). Without them, songs stay switched off, except in
// `astro dev`, where a pretend Spotify stands in (a few made-up tracks,
// and a playlist that only exists in the database) so the RSVP form and the
// QA suite work without an account.
//
// Development Mode apps (since 2026): the app's owner needs Premium, and
// only allowlisted accounts can connect. Search returns at most 10 results,
// playlists are made with POST /me/playlists, and tracks go in and out
// through /playlists/{id}/items.

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
export const SPOTIFY_SCOPES = "playlist-modify-public playlist-modify-private";
export const PLAYLIST_NAME = "Over the Hill";
const PLAYLIST_DESCRIPTION = "Songs picked by everyone coming to Over the Hill, 13–15 August 2027.";

const FAKE = import.meta.env.DEV && !SPOTIFY_CLIENT_ID;

export function isSpotifyConfigured(): boolean {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) || FAKE;
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface AuthRow {
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
  account_id: string;
  account_name: string | null;
  playlist_id: string | null;
  playlist_url: string | null;
}

export interface SpotifyStatus {
  /** App keys set (or the pretend Spotify in dev). */
  configured: boolean;
  fake: boolean;
  /** A host's account is connected. */
  connected: boolean;
  accountName: string | null;
  playlistId: string | null;
  playlistUrl: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

const FAKE_STATUS: SpotifyStatus = {
  configured: true,
  fake: true,
  connected: true,
  accountName: "Pretend Spotify (local only)",
  playlistId: "0000000000000000000000",
  playlistUrl: "https://open.spotify.com/playlist/0000000000000000000000",
};

async function getAuthRow(): Promise<AuthRow | null> {
  return getDb().prepare("select * from spotify_auth where id = 1").first<AuthRow>();
}

export async function getSpotifyStatus(): Promise<SpotifyStatus> {
  if (FAKE) return FAKE_STATUS;
  const configured = isSpotifyConfigured();
  const row = configured ? await getAuthRow() : null;
  return {
    configured,
    fake: false,
    connected: !!row,
    accountName: row?.account_name ?? null,
    playlistId: row?.playlist_id ?? null,
    playlistUrl: row?.playlist_url ?? null,
  };
}

/** Guests can pick songs: Spotify's connected and there's a playlist. */
export function songsOpen(status: SpotifyStatus): boolean {
  return status.connected && !!status.playlistId;
}

// --- Signing in (admin Spotify) ---

function basicAuth(): string {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) throw new SpotifyError("Spotify's app keys aren't set", 503);
  return `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`;
}

/** The sign-in's one-off state, checked when Spotify sends the host back. */
export const STATE_COOKIE = "spotify_state";

/** Where Spotify sends the host back to. Each one must be listed in the
 * Spotify app's settings (Spotify won't take "localhost": use 127.0.0.1). */
export function callbackUrl(origin: string): string {
  return new URL("/api/admin/spotify/callback", origin).toString();
}

/** Where "Connect Spotify" sends the host. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID ?? "",
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

interface TokenAnswer {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenAnswer> {
  const response = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new SpotifyError(`Spotify sign-in failed (${response.status}): ${await response.text()}`, response.status);
  return response.json();
}

function expiresAt(seconds: number): string {
  // a minute early, so a token never runs out mid-request
  return new Date(Date.now() + (seconds - 60) * 1000).toISOString();
}

/** Back from Spotify's sign-in: keeps the account's tokens. A new account
 * starts without a playlist; the same one keeps its playlist. */
export async function connectAccount(code: string, redirectUri: string): Promise<void> {
  const token = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }));
  if (!token.refresh_token) throw new SpotifyError("Spotify didn't send a refresh token", 502);
  const me = await apiWith<{ id: string; display_name?: string | null }>(token.access_token, "GET", "/me");
  const previous = await getAuthRow();
  const sameAccount = previous?.account_id === me.id;
  await getDb()
    .prepare(
      `insert into spotify_auth (id, refresh_token, access_token, access_expires_at, account_id, account_name, playlist_id, playlist_url, updated_at)
       values (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       on conflict (id) do update set
         refresh_token = excluded.refresh_token, access_token = excluded.access_token,
         access_expires_at = excluded.access_expires_at, account_id = excluded.account_id,
         account_name = excluded.account_name, playlist_id = excluded.playlist_id,
         playlist_url = excluded.playlist_url, updated_at = excluded.updated_at`,
    )
    .bind(
      token.refresh_token,
      token.access_token,
      expiresAt(token.expires_in),
      me.id,
      me.display_name || me.id,
      sameAccount ? previous.playlist_id : null,
      sameAccount ? previous.playlist_url : null,
      nowIso(),
    )
    .run();
}

export async function disconnectSpotify(): Promise<void> {
  await getDb().prepare("delete from spotify_auth").run();
}

async function getAccessToken(): Promise<string> {
  const row = await getAuthRow();
  if (!row) throw new SpotifyError("No Spotify account is connected", 503);
  if (row.access_token && row.access_expires_at && row.access_expires_at > nowIso()) return row.access_token;
  const token = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }));
  // Spotify may hand back a new refresh token; the old one then stops working.
  await getDb()
    .prepare("update spotify_auth set access_token = ?, access_expires_at = ?, refresh_token = ?, updated_at = ? where id = 1")
    .bind(token.access_token, expiresAt(token.expires_in), token.refresh_token ?? row.refresh_token, nowIso())
    .run();
  return token.access_token;
}

async function apiWith<T>(accessToken: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new SpotifyError(`Spotify ${method} ${path.split("?")[0]} failed (${response.status}): ${await response.text()}`, response.status);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  return apiWith<T>(await getAccessToken(), method, path, body);
}

// --- The pretend Spotify (astro dev without app keys) ---

const FAKE_TRACKS: Track[] = [
  { id: "3n3Ppam7vgaVa1iaRUc9Lp", title: "Mr. Brightside", artist: "The Killers", imageUrl: null },
  { id: "4uLU6hMCjMI75M1A2tKUQC", title: "Never Gonna Give You Up", artist: "Rick Astley", imageUrl: null },
  { id: "7GhIk7Il098yCjg4BQjzvb", title: "Dancing Queen", artist: "ABBA", imageUrl: null },
  { id: "0VjIjW4GlUZAMYd2vXMi3b", title: "Blinding Lights", artist: "The Weeknd", imageUrl: null },
  { id: "5ghIJDpPoe3CfHMGu71E6T", title: "Here Comes the Sun", artist: "The Beatles", imageUrl: null },
  { id: "2Fxmhks0bxGSBdJ92vM42m", title: "Bad Guy", artist: "Billie Eilish", imageUrl: null },
];

// --- Tracks and the playlist ---

/** Up to 8 tracks for what a guest typed. */
export async function searchTracks(query: string): Promise<Track[]> {
  if (FAKE) {
    const q = query.toLowerCase();
    return FAKE_TRACKS.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q));
  }
  // UK availability. (market=from_token would need the user-read-private
  // scope, which the site doesn't ask for: Spotify answers 403.)
  const params = new URLSearchParams({ q: query, type: "track", limit: "8", market: "GB" });
  return mapSearchResponse(await api("GET", `/search?${params}`));
}

/** One track, or null if Spotify doesn't know it. */
export async function getTrack(id: string): Promise<Track | null> {
  if (FAKE) return FAKE_TRACKS.find((t) => t.id === id) ?? null;
  try {
    return mapTrack(await api("GET", `/tracks/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof SpotifyError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

async function playlistId(): Promise<string> {
  const status = await getSpotifyStatus();
  if (!status.playlistId) throw new SpotifyError("There's no playlist yet", 503);
  return status.playlistId;
}

async function addToPlaylist(trackIds: string[]): Promise<void> {
  if (FAKE || trackIds.length === 0) return;
  const id = await playlistId();
  for (let i = 0; i < trackIds.length; i += 100) {
    await api("POST", `/playlists/${id}/items`, { uris: trackIds.slice(i, i + 100).map(trackUri) });
  }
}

async function removeFromPlaylist(trackIds: string[]): Promise<void> {
  if (FAKE || trackIds.length === 0) return;
  const id = await playlistId();
  for (let i = 0; i < trackIds.length; i += 100) {
    await api("DELETE", `/playlists/${id}/items`, { items: trackIds.slice(i, i + 100).map((t) => ({ uri: trackUri(t) })) });
  }
}

async function setPlaylist(id: string, url: string): Promise<void> {
  // A different playlist: every song needs adding to it.
  await getDb().batch([
    getDb().prepare("update spotify_auth set playlist_id = ?, playlist_url = ?, updated_at = ? where id = 1").bind(id, url, nowIso()),
    getDb().prepare("update song_picks set added_at = null"),
  ]);
}

/** Makes a public "Over the Hill" playlist on the connected account. */
export async function createPlaylist(): Promise<void> {
  const playlist = await api<{ id: string; external_urls?: { spotify?: string } }>("POST", "/me/playlists", {
    name: PLAYLIST_NAME,
    description: PLAYLIST_DESCRIPTION,
    public: true,
  });
  await setPlaylist(playlist.id, playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`);
}

/** A playlist the host made themselves (their link pasted in admin). The
 * connected account must own it, or be a collaborator, to add to it. */
export async function useExistingPlaylist(id: string): Promise<void> {
  await setPlaylist(id, `https://open.spotify.com/playlist/${id}`);
}

// --- Guests' picks ---

export async function listGuestSongs(guestId: string): Promise<SongPick[]> {
  const { results } = await getDb()
    .prepare("select * from song_picks where guest_id = ? order by position")
    .bind(guestId)
    .all<SongPick>();
  return results;
}

export interface SongRow extends SongPick {
  guest_name: string;
}

/** Every pick, for admin Spotify and the CSV. */
export async function listAllSongs(): Promise<SongRow[]> {
  const { results } = await getDb()
    .prepare(
      `select s.*, g.name as guest_name from song_picks s join guests g on g.id = s.guest_id
       order by s.created_at desc, s.position`,
    )
    .all<SongRow>();
  return results;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

/** Saves a guest's songs (their whole list, in order: [] to clear them)
 * and brings the playlist into line. The database is saved first, so
 * nothing they picked is lost if Spotify then fails: those picks wait,
 * not added, for admin Spotify to retry. `failed`: some of it didn't
 * reach Spotify. `dropped`: picks that couldn't be looked up, so weren't
 * saved. */
export async function saveGuestSongs(
  guestId: string,
  wanted: string[],
  actor = "guest",
): Promise<{ failed: boolean; dropped: number }> {
  const db = getDb();
  const current = await listGuestSongs(guestId);
  const involved = [...new Set([...current.map((p) => p.track_id), ...wanted])];
  const others = involved.length
    ? (
        await db
          .prepare(
            `select track_id, title, artist, image_url, added_at from song_picks
             where guest_id <> ? and track_id in (${placeholders(involved.length)})`,
          )
          .bind(guestId, ...involved)
          .all<Pick<SongPick, "track_id" | "title" | "artist" | "image_url" | "added_at">>()
      ).results
    : [];
  const othersPicked = new Set(others.map((o) => o.track_id));
  const othersAdded = new Map(others.filter((o) => o.added_at).map((o) => [o.track_id, o.added_at!]));
  const plan = planSongChanges(current, wanted, othersPicked, othersAdded);

  // Each new track's title and artist: from another guest's pick of it, or
  // from Spotify (which also checks it's a real track).
  let failed = false;
  let dropped = 0;
  const added: { trackId: string; position: number; addedAt: string | null; track: Track }[] = [];
  for (const add of plan.add) {
    const known = others.find((o) => o.track_id === add.trackId);
    let track: Track | null = known
      ? { id: known.track_id, title: known.title, artist: known.artist, imageUrl: known.image_url }
      : null;
    if (!track) {
      try {
        track = await getTrack(add.trackId);
      } catch (err) {
        console.error("Spotify track lookup failed", err);
        failed = true;
      }
    }
    if (track) added.push({ ...add, track });
    else dropped += 1;
  }

  const changed = plan.remove.length > 0 || added.length > 0 || plan.keep.some((k) => current.find((c) => c.id === k.id)?.position !== k.position);
  if (changed) {
    const now = nowIso();
    const kept = plan.keep.map((k) => current.find((c) => c.id === k.id)!);
    const label = [...kept.map(songLabel), ...added.map((a) => songLabel(a.track))].join("; ");
    await db.batch([
      ...plan.remove.map((id) => db.prepare("delete from song_picks where id = ?").bind(id)),
      ...plan.keep.map((k) => db.prepare("update song_picks set position = ? where id = ?").bind(k.position, k.id)),
      ...added.map((a) =>
        db
          .prepare(
            `insert into song_picks (id, guest_id, track_id, title, artist, image_url, position, added_at, created_at)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), guestId, a.trackId, a.track.title, a.track.artist, a.track.imageUrl, a.position, a.addedAt, now),
      ),
      eventStatement(db, guestId, actor, "songs", label ? `Songs: ${label}` : "Removed their songs"),
    ]);
  }

  const toAdd = added.filter((a) => a.addedAt === null).map((a) => a.trackId);
  try {
    await addToPlaylist(toAdd);
    if (toAdd.length) {
      await db
        .prepare(`update song_picks set added_at = ? where added_at is null and track_id in (${placeholders(toAdd.length)})`)
        .bind(nowIso(), ...toAdd)
        .run();
    }
  } catch (err) {
    console.error("Adding songs to the playlist failed", err);
    failed = true;
  }
  try {
    await removeFromPlaylist(plan.playlistRemove);
  } catch (err) {
    console.error("Removing songs from the playlist failed", err);
    failed = true;
  }
  return { failed, dropped };
}

/** Picks not on the playlist yet (Spotify was down, or the playlist
 * changed). */
export async function countMissingSongs(): Promise<number> {
  const row = await getDb()
    .prepare("select count(distinct track_id) as n from song_picks where added_at is null")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Puts every pick not on the playlist yet onto it. Returns how many
 * tracks went on. */
export async function addMissingSongs(): Promise<number> {
  const db = getDb();
  const { results } = await db
    .prepare("select distinct track_id from song_picks where added_at is null")
    .all<{ track_id: string }>();
  const ids = results.map((r) => r.track_id);
  if (ids.length === 0) return 0;
  await addToPlaylist(ids);
  await db.prepare("update song_picks set added_at = ? where added_at is null").bind(nowIso()).run();
  return ids.length;
}
