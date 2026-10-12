// Reads the hosts' invite spreadsheet (the "List" tab, as CSV): one block of
// three columns (Round, First Name, Surname) per host, plus "Communal".
// Pure, so it's unit-tested; the admin import page uses it.
//
// - Rounds 1–3 are the invite phases; round 0 is bands and other acts
//   (imported as performers, their own group).
// - Anyone without a known surname ("?", blank, only a note in brackets, or
//   an unsure "Smith?") is skipped and reported for correcting in the sheet.
// - Someone listed by several hosts becomes one guest, invited by all of
//   them, in the earliest round given. Near-identical names are flagged.
// - Communal guests have no inviter; the "Unlikely" block isn't read.

import type { InvitePhase } from "./guests";

export type ImportGroup = 1 | 2 | 3 | "acts";

/** The phase as stored on a guest ('1', '2', '3', 'acts'). */
export function phaseOf(group: ImportGroup): InvitePhase {
  return String(group) as InvitePhase;
}

/** A sheet's round ("1", "2.0", "0") as a phase, or null if it isn't one. */
export function roundToPhase(round: string): InvitePhase | null {
  const n = Number.parseFloat(round);
  return n === 0 ? "acts" : n === 1 || n === 2 || n === 3 ? (String(n) as InvitePhase) : null;
}

export interface ImportGuest {
  name: string;
  group: ImportGroup;
  inviters: string[];
  performer: boolean;
}

export interface SkippedInvite {
  host: string;
  round: string;
  first: string;
  surname: string;
  reason: string;
}

export interface ImportPlan {
  guests: ImportGuest[];
  skipped: SkippedInvite[];
  /** Pairs that look like the same person spelt two ways. */
  possibleDuplicates: [ImportGuest, ImportGuest][];
}

const PHASE_ORDER: InvitePhase[] = ["1", "2", "3"];

/** One guest from a possible-duplicate pair that's the same person: every
 * host who listed them, the earlier phase, and an act stays an act. */
export function mergeCandidates(
  name: string,
  candidates: ImportGuest[],
): { name: string; phase: InvitePhase; inviters: string[]; performer: boolean } {
  const performer = candidates.some((c) => c.performer);
  const phases = candidates.map((c) => phaseOf(c.group));
  const phase: InvitePhase = performer ? "acts" : (PHASE_ORDER.find((p) => phases.includes(p)) ?? phases[0]);
  const inviters = [...new Set(candidates.flatMap((c) => c.inviters))];
  return { name, phase, inviters, performer };
}

/** A first guess at a skipped row's name, to pre-fill the fix form:
 * without "?" or notes in brackets ("Smith?" -> "Smith", "(Tom)" -> ""). */
export function suggestName(first: string, surname: string): { first: string; surname: string } {
  const clean = (s: string) => tidy(s.replace(/\([^)]*\)/g, " ").replace(/\+\s*\d*/g, " ").replace(/\?/g, " "));
  return { first: clean(first), surname: clean(surname) };
}

/** Identifies a skipped row across uploads of the sheet. */
export function skippedKey(s: SkippedInvite): string {
  return ["skipped", s.host, roundToPhase(s.round) ?? s.round, s.first, s.surname].join("|").toLowerCase();
}

/** Identifies a possible-duplicate pair across uploads (either order). */
export function duplicateKey(a: { name: string }, b: { name: string }): string {
  return ["duplicate", ...[a.name, b.name].map((n) => n.toLowerCase()).sort()].join("|");
}

/** Everyone in a possible-duplicate pair: held back from importing until a
 * host says whether they're one person or two. */
export function heldBackNames(plan: ImportPlan): Set<string> {
  return new Set(plan.possibleDuplicates.flatMap(([a, b]) => [a.name, b.name]));
}

/** A minimal CSV parser (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "jack" -> "Jack", "o'brien" -> "O'Brien" (mixed case is left alone),
 * without stray commas or full stops at either end. */
function tidy(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim().replace(/^[,.;:]+|[,.;:]+$/g, "").trim();
  return clean === clean.toLowerCase() ? clean.replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : clean;
}

function unknownSurname(first: string, surname: string): string | null {
  if (!surname) return "no surname";
  if (surname.includes("?") || first.includes("?")) return "surname unknown or unsure";
  if (surname.includes("(") || first.includes("(")) return "surname has a note in brackets";
  if (first.includes("+")) return "a plus-one, not a name";
  return null;
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function planImport(csvText: string): ImportPlan {
  const rows = parseCsv(csvText);
  const hosts = rows[0] ?? [];
  const labels = rows[1] ?? [];
  const blocks: { col: number; host: string }[] = [];
  for (let col = 0; col + 2 < labels.length && labels[col]?.trim() === "Round"; col += 3) {
    blocks.push({ col, host: hosts[col]?.trim() ?? "" });
  }

  const byKey = new Map<string, ImportGuest>();
  const skipped: SkippedInvite[] = [];
  for (const row of rows.slice(2)) {
    for (const { col, host } of blocks) {
      const [round = "", rawFirst = "", rawSurname = ""] = row.slice(col, col + 3).map((v) => v.replace(/\s+/g, " ").trim());
      if (!rawFirst && !rawSurname) continue;                  // e.g. a stray "6 (Band)"
      const phase = roundToPhase(round);
      const group: ImportGroup | null = phase === null ? null : phase === "acts" ? "acts" : (Number(phase) as 1 | 2 | 3);
      const problem = group === null ? `round "${round}" isn't 0–3` : unknownSurname(rawFirst, rawSurname);
      if (problem) {
        skipped.push({ host, round, first: rawFirst, surname: rawSurname, reason: problem });
        continue;
      }
      const name = `${tidy(rawFirst)} ${tidy(rawSurname)}`;
      const key = name.toLowerCase().replace(/\s+/g, "");
      const guest = byKey.get(key) ?? { name, group: group!, inviters: [], performer: false };
      if (host && host !== "Communal" && !guest.inviters.includes(host)) guest.inviters.push(host);
      if (group === "acts") guest.performer = true;
      else if (guest.group === "acts" || group! < (guest.group as number)) guest.group = group!;
      if (guest.performer) guest.group = "acts";
      byKey.set(key, guest);
    }
  }

  const guests = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  const possibleDuplicates: [ImportGuest, ImportGuest][] = [];
  const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, "");
  for (let i = 0; i < guests.length; i++)
    for (let j = i + 1; j < guests.length; j++) {
      const a = squash(guests[i].name), b = squash(guests[j].name);
      if (editDistance(a, b) <= 2) possibleDuplicates.push([guests[i], guests[j]]);
    }
  return { guests, skipped, possibleDuplicates };
}
