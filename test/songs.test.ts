import { describe, expect, it } from "vitest";
import {
  mapSearchResponse,
  mapTrack,
  parsePlaylistRef,
  parseTrackRef,
  planSongChanges,
  songLabel,
  songsFromForm,
} from "../src/lib/songs";

const A = "4uLU6hMCjMI75M1A2tKUQC";
const B = "7GhIk7Il098yCjg4BQjzvb";
const C = "0VjIjW4GlUZAMYd2vXMi3b";
const D = "3n3Ppam7vgaVa1iaRUc9Lp";

describe("parseTrackRef", () => {
  it("accepts an id, a URI and share links", () => {
    expect(parseTrackRef(A)).toBe(A);
    expect(parseTrackRef(` spotify:track:${A} `)).toBe(A);
    expect(parseTrackRef(`https://open.spotify.com/track/${A}`)).toBe(A);
    expect(parseTrackRef(`https://open.spotify.com/track/${A}?si=abc123`)).toBe(A);
    expect(parseTrackRef(`https://open.spotify.com/intl-de/track/${A}`)).toBe(A);
  });

  it("refuses anything that isn't a track", () => {
    expect(parseTrackRef("Mr Brightside")).toBeNull();
    expect(parseTrackRef(`https://open.spotify.com/album/${A}`)).toBeNull();
    expect(parseTrackRef(`https://open.spotify.com/playlist/${A}`)).toBeNull();
    expect(parseTrackRef(`http://open.spotify.com/track/${A}`)).toBeNull();
    expect(parseTrackRef(`https://evil.example/track/${A}`)).toBeNull();
    expect(parseTrackRef(`${A}x`)).toBeNull();
  });
});

describe("songsFromForm", () => {
  it("keeps the order, drops blanks and repeats, and caps at three", () => {
    expect(songsFromForm([A, "", B, A, C, D])).toEqual({ ids: [A, B, C], invalid: 0 });
  });

  it("counts what isn't a track", () => {
    expect(songsFromForm(["some song", A])).toEqual({ ids: [A], invalid: 1 });
  });
});

describe("mapTrack and mapSearchResponse", () => {
  const raw = {
    id: A,
    name: "Mr. Brightside",
    type: "track",
    artists: [{ name: "The Killers" }, { name: "Someone" }],
    album: {
      images: [
        { url: "https://i.scdn.co/image/big", width: 640 },
        { url: "https://i.scdn.co/image/small", width: 64 },
        { url: "https://i.scdn.co/image/mid", width: 300 },
      ],
    },
  };

  it("reads a track, joining artists and picking the small picture", () => {
    expect(mapTrack(raw)).toEqual({
      id: A,
      title: "Mr. Brightside",
      artist: "The Killers, Someone",
      imageUrl: "https://i.scdn.co/image/small",
    });
  });

  it("copes with no pictures or artists, and refuses non-tracks", () => {
    expect(mapTrack({ id: A, name: "X", artists: [], album: { images: [] } })).toEqual({
      id: A,
      title: "X",
      artist: "Unknown artist",
      imageUrl: null,
    });
    expect(mapTrack({ ...raw, type: "episode" })).toBeNull();
    expect(mapTrack({ ...raw, id: "nope" })).toBeNull();
    expect(mapTrack(null)).toBeNull();
  });

  it("reads a search answer, skipping broken items", () => {
    expect(mapSearchResponse({ tracks: { items: [raw, null, { id: "x" }] } })).toHaveLength(1);
    expect(mapSearchResponse({})).toEqual([]);
  });
});

describe("planSongChanges", () => {
  const pick = (id: string, track_id: string, position: number) => ({ id, track_id, position });

  it("adds new picks to the playlist", () => {
    const plan = planSongChanges([], [A, B], new Set(), new Map());
    expect(plan.add).toEqual([
      { trackId: A, position: 1, addedAt: null },
      { trackId: B, position: 2, addedAt: null },
    ]);
    expect(plan.playlistAdd).toEqual([A, B]);
    expect(plan.remove).toEqual([]);
  });

  it("keeps picks that stay, renumbered, and removes dropped ones", () => {
    const plan = planSongChanges([pick("p1", A, 1), pick("p2", B, 2)], [B, C], new Set(), new Map());
    expect(plan.keep).toEqual([{ id: "p2", position: 1 }]);
    expect(plan.remove).toEqual(["p1"]);
    expect(plan.playlistRemove).toEqual([A]);
    expect(plan.playlistAdd).toEqual([C]);
  });

  it("leaves a track on the playlist while someone else has picked it", () => {
    const plan = planSongChanges([pick("p1", A, 1)], [], new Set([A]), new Map());
    expect(plan.remove).toEqual(["p1"]);
    expect(plan.playlistRemove).toEqual([]);
  });

  it("doesn't add a track twice when someone else already put it on", () => {
    const plan = planSongChanges([], [A], new Set([A]), new Map([[A, "2026-10-12T10:00:00.000Z"]]));
    expect(plan.add).toEqual([{ trackId: A, position: 1, addedAt: "2026-10-12T10:00:00.000Z" }]);
    expect(plan.playlistAdd).toEqual([]);
  });

  it("clears everything when they decline", () => {
    const plan = planSongChanges([pick("p1", A, 1), pick("p2", B, 2)], [], new Set(), new Map());
    expect(plan.remove).toEqual(["p1", "p2"]);
    expect(plan.playlistRemove).toEqual([A, B]);
  });
});

describe("parsePlaylistRef and songLabel", () => {
  it("reads playlist links", () => {
    expect(parsePlaylistRef(`https://open.spotify.com/playlist/${A}?si=x`)).toBe(A);
    expect(parsePlaylistRef(`spotify:playlist:${A}`)).toBe(A);
    expect(parsePlaylistRef(`https://open.spotify.com/track/${A}`)).toBeNull();
  });

  it("labels a song", () => {
    expect(songLabel({ title: "Mr. Brightside", artist: "The Killers" })).toBe("Mr. Brightside – The Killers");
  });
});
