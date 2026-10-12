// Guests' songs for the communal playlist: the pure parts (reading what a
// guest sent, reading Spotify's answers, and working out what changes),
// kept apart from src/lib/spotify.ts (the API and the database) so they're
// unit-tested.

/** Up to three songs each. */
export const MAX_SONGS = 3;

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Album art, about 64px (null if Spotify has none). */
  imageUrl: string | null;
}

/** A guest's pick as stored (migrations/0021). */
export interface SongPick {
  id: string;
  guest_id: string;
  track_id: string;
  title: string;
  artist: string;
  image_url: string | null;
  position: number;
  added_at: string | null;
  created_at: string;
}

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

/** A track's id from what a guest sent: the id itself (what the search
 * puts in the form), "spotify:track:<id>", or a share link pasted in
 * (open.spotify.com/track/<id>, maybe /intl-xx/, maybe ?si=…). null for
 * anything else, including links to albums or playlists. */
export function parseTrackRef(value: string): string | null {
  const text = value.trim();
  if (TRACK_ID.test(text)) return text;
  const uri = text.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return uri[1];
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
  const path = url.pathname.match(/^(?:\/intl-[a-z-]+)?\/track\/([A-Za-z0-9]{22})\/?$/i);
  return path ? path[1] : null;
}

/** The songs a guest sent, in order: each slot's value read as a track,
 * blanks and repeats dropped, at most MAX_SONGS. `invalid` counts what
 * was filled in but isn't a track, so the page can say so. */
export function songsFromForm(values: string[]): { ids: string[]; invalid: number } {
  const ids: string[] = [];
  let invalid = 0;
  for (const value of values) {
    if (!value.trim()) continue;
    const id = parseTrackRef(value);
    if (!id) invalid += 1;
    else if (!ids.includes(id)) ids.push(id);
  }
  return { ids: ids.slice(0, MAX_SONGS), invalid };
}

interface SpotifyImage {
  url?: string;
  width?: number | null;
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  type?: string;
  artists?: { name?: string }[];
  album?: { images?: SpotifyImage[] };
}

/** The smallest picture at least 60px wide (Spotify lists 640, 300, 64). */
function smallImage(images: SpotifyImage[] | undefined): string | null {
  const usable = (images ?? []).filter((image) => image.url?.startsWith("https://"));
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((image) => (image.width ?? 0) >= 60) ?? sorted[sorted.length - 1]).url!;
}

/** One track from Spotify's API, or null if it isn't a playable-looking
 * track (e.g. a podcast episode, or a malformed answer). */
export function mapTrack(raw: unknown): Track | null {
  const track = raw as SpotifyTrack | null;
  if (!track || typeof track.id !== "string" || !TRACK_ID.test(track.id) || !track.name) return null;
  if (track.type && track.type !== "track") return null;
  const artist = (track.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  return { id: track.id, title: track.name, artist: artist || "Unknown artist", imageUrl: smallImage(track.album?.images) };
}

/** The tracks in a search answer ({ tracks: { items: [...] } }). */
export function mapSearchResponse(raw: unknown): Track[] {
  const items = (raw as { tracks?: { items?: unknown[] } } | null)?.tracks?.items;
  return Array.isArray(items) ? items.map(mapTrack).filter((t): t is Track => t !== null) : [];
}

/** What a guest's new list of songs means.
 * - `keep`: picks that stay, with their new position;
 * - `remove`: picks they've dropped;
 * - `add`: tracks they've newly picked, in their slot;
 * - `playlistRemove`: dropped tracks nobody else has picked, which come off
 *   the playlist;
 * - `playlistAdd`: new tracks not already on the playlist through someone
 *   else's pick.
 * `othersPicked` / `othersAdded`: tracks other guests have picked, and the
 * ones of those already on the playlist (with when). */
export function planSongChanges(
  current: Pick<SongPick, "id" | "track_id" | "position">[],
  wanted: string[],
  othersPicked: Set<string>,
  othersAdded: Map<string, string>,
): {
  keep: { id: string; position: number }[];
  remove: string[];
  add: { trackId: string; position: number; addedAt: string | null }[];
  playlistRemove: string[];
  playlistAdd: string[];
} {
  const wantedIds = wanted.slice(0, MAX_SONGS);
  const keep: { id: string; position: number }[] = [];
  const add: { trackId: string; position: number; addedAt: string | null }[] = [];
  wantedIds.forEach((trackId, i) => {
    const existing = current.find((pick) => pick.track_id === trackId);
    if (existing) keep.push({ id: existing.id, position: i + 1 });
    else add.push({ trackId, position: i + 1, addedAt: othersAdded.get(trackId) ?? null });
  });
  const dropped = current.filter((pick) => !wantedIds.includes(pick.track_id));
  return {
    keep,
    remove: dropped.map((pick) => pick.id),
    add,
    playlistRemove: dropped.map((pick) => pick.track_id).filter((id) => !othersPicked.has(id)),
    playlistAdd: add.filter((a) => a.addedAt === null).map((a) => a.trackId),
  };
}

/** "Song – Artist", for answers, emails and the CSV. */
export function songLabel(pick: Pick<SongPick, "title" | "artist">): string {
  return `${pick.title} – ${pick.artist}`;
}

export function trackUri(id: string): string {
  return `spotify:track:${id}`;
}

/** The playlist's id from a link a host pasted
 * (open.spotify.com/playlist/<id>) or "spotify:playlist:<id>". */
export function parsePlaylistRef(value: string): string | null {
  const text = value.trim();
  const uri = text.match(/^spotify:playlist:([A-Za-z0-9]{22})$/);
  if (uri) return uri[1];
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const path = url.pathname.match(/^(?:\/intl-[a-z-]+)?\/playlist\/([A-Za-z0-9]{22})\/?$/i);
    return path ? path[1] : null;
  } catch {
    return null;
  }
}
