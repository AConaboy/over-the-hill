// The invite import's to-fix list: rows it couldn't import (no known
// surname) and possible duplicates, kept in the database so hosts can sort
// them out one at a time, whenever they've found out, and see each other's
// notes. See migrations/0017 and /admin/import/fix.
import { getDb } from "./db";
import { addInvitersToGuest, importGuests, type InvitePhase } from "./guests";
import {
  duplicateKey,
  mergeCandidates,
  phaseOf,
  roundToPhase,
  skippedKey,
  type ImportGuest,
  type ImportPlan,
} from "./inviteImport";

export type IssueStatus = "open" | "resolved" | "dismissed";

export interface ImportIssue {
  id: string;
  kind: "skipped" | "duplicate";
  source_key: string;
  phase: InvitePhase | null;
  host: string | null;
  round: string | null;
  first_name: string | null;
  surname: string | null;
  reason: string | null;
  /** duplicate: JSON of the two ImportGuests */
  candidates: string | null;
  status: IssueStatus;
  note: string | null;
  resolution: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

const now = () => new Date().toISOString();

export function issueCandidates(issue: Pick<ImportIssue, "candidates">): ImportGuest[] {
  return issue.candidates ? (JSON.parse(issue.candidates) as ImportGuest[]) : [];
}

/** Saves an upload's problems in the phases being imported (a repeat of one
 * already listed is ignored), and marks open ones in those phases that have
 * gone from the sheet (so were fixed there) as resolved. */
export async function saveIssues(
  plan: ImportPlan,
  phases: InvitePhase[],
  actor: string,
): Promise<{ added: number; fixedInSheet: number }> {
  const db = getDb();
  const at = now();
  const statements: D1PreparedStatement[] = [];
  const keys = new Set<string>();

  for (const row of plan.skipped) {
    const phase = roundToPhase(row.round);
    if (phase !== null && !phases.includes(phase)) continue;
    const key = skippedKey(row);
    keys.add(key);
    statements.push(
      db
        .prepare(
          `insert into import_issues (id, kind, source_key, phase, host, round, first_name, surname, reason, updated_by, updated_at, created_at)
           values (?, 'skipped', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict (source_key) do nothing`,
        )
        .bind(crypto.randomUUID(), key, phase, row.host, row.round, row.first, row.surname, row.reason, actor, at, at),
    );
  }
  for (const pair of plan.possibleDuplicates) {
    if (!pair.some((c) => phases.includes(phaseOf(c.group)))) continue;
    const key = duplicateKey(pair[0], pair[1]);
    keys.add(key);
    statements.push(
      db
        .prepare(
          `insert into import_issues (id, kind, source_key, phase, candidates, reason, updated_by, updated_at, created_at)
           values (?, 'duplicate', ?, ?, ?, 'names spelt almost the same', ?, ?, ?) on conflict (source_key) do nothing`,
        )
        .bind(crypto.randomUUID(), key, mergeCandidates(pair[0].name, pair).phase, JSON.stringify(pair), actor, at, at),
    );
  }

  const before = await openIssueCount();
  for (let i = 0; i < statements.length; i += 90) await db.batch(statements.slice(i, i + 90));
  const added = (await openIssueCount()) - before;

  // Open issues in these phases that this upload no longer has: fixed in the sheet.
  const { results: open } = await db.prepare("select * from import_issues where status = 'open'").all<ImportIssue>();
  const gone = open.filter((issue) => {
    if (keys.has(issue.source_key)) return false;
    const issuePhases = issue.kind === "duplicate" ? issueCandidates(issue).map((c) => phaseOf(c.group)) : [issue.phase];
    return issuePhases.some((p) => p !== null && phases.includes(p));
  });
  if (gone.length) {
    await db.batch(
      gone.map((issue) =>
        db
          .prepare("update import_issues set status = 'resolved', resolution = ?, updated_by = ?, updated_at = ? where id = ?")
          .bind("No longer in the sheet (fixed there)", actor, at, issue.id),
      ),
    );
  }
  return { added, fixedInSheet: gone.length };
}

export async function listIssues(): Promise<ImportIssue[]> {
  const { results } = await getDb()
    .prepare(
      `select * from import_issues
       order by case status when 'open' then 0 else 1 end, kind, phase, host, first_name, updated_at desc`,
    )
    .all<ImportIssue>();
  return results;
}

export async function openIssueCount(): Promise<number> {
  const row = await getDb().prepare("select count(*) as n from import_issues where status = 'open'").first<{ n: number }>();
  return row?.n ?? 0;
}

async function getIssue(id: string): Promise<ImportIssue | null> {
  return (await getDb().prepare("select * from import_issues where id = ?").bind(id).first<ImportIssue>()) ?? null;
}

async function setStatus(id: string, status: IssueStatus, resolution: string | null, actor: string): Promise<void> {
  await getDb()
    .prepare("update import_issues set status = ?, resolution = ?, updated_by = ?, updated_at = ? where id = ?")
    .bind(status, resolution, actor, now(), id)
    .run();
}

export async function saveIssueNote(id: string, note: string | null, actor: string): Promise<void> {
  await getDb()
    .prepare("update import_issues set note = ?, updated_by = ?, updated_at = ? where id = ?")
    .bind(note, actor, now(), id)
    .run();
}

export async function dismissIssue(id: string, actor: string): Promise<void> {
  await setStatus(id, "dismissed", "Not inviting them", actor);
}

export async function reopenIssue(id: string, actor: string): Promise<void> {
  await setStatus(id, "open", null, actor);
}

const FIX_SOURCE = "the import's to-fix list";

/** A skipped row, now with a full name: added as a guest. */
export async function addSkippedGuest(
  id: string,
  guest: { name: string; phase: InvitePhase; inviters: string[] },
  actor: string,
): Promise<"added" | "exists" | "missing"> {
  const issue = await getIssue(id);
  if (!issue || issue.kind !== "skipped" || issue.status !== "open") return "missing";
  const result = await importGuests(
    [{ name: guest.name, phase: guest.phase, inviterNames: guest.inviters, isPerformer: guest.phase === "acts" }],
    actor,
    FIX_SOURCE,
  );
  if (result.added.length === 0) return "exists";
  await setStatus(id, "resolved", `Added as ${guest.name}`, actor);
  return "added";
}

/** A possible duplicate: one person (under the chosen spelling, with both
 * listings' hosts) or two. Anyone already on the list is kept, and just
 * gets any hosts they're missing. */
export async function resolveDuplicate(id: string, sameName: string | null, actor: string): Promise<boolean> {
  const issue = await getIssue(id);
  if (!issue || issue.kind !== "duplicate" || issue.status !== "open") return false;
  const candidates = issueCandidates(issue);
  const db = getDb();
  const onList = async (name: string) =>
    (await db.prepare("select id, name from guests where lower(name) = lower(?)").bind(name).first<{ id: string; name: string }>()) ??
    null;

  if (sameName && candidates.some((c) => c.name === sameName)) {
    const merged = mergeCandidates(sameName, candidates);
    // either may already be on the list (imported earlier, or added by hand)
    let existing: { id: string; name: string } | null = null;
    for (const c of [candidates.find((c) => c.name === sameName)!, ...candidates]) existing ??= await onList(c.name);
    if (existing) {
      const others = candidates.map((c) => c.name).filter((n) => n.toLowerCase() !== existing!.name.toLowerCase());
      await addInvitersToGuest(existing.id, merged.inviters, actor, `Also listed in the spreadsheet as ${others.join(", ")}`);
      await setStatus(id, "resolved", `Same person: kept ${existing.name}`, actor);
    } else {
      await importGuests(
        [{ name: merged.name, phase: merged.phase, inviterNames: merged.inviters, isPerformer: merged.performer }],
        actor,
        FIX_SOURCE,
      );
      await setStatus(id, "resolved", `Same person: added as ${merged.name}`, actor);
    }
    return true;
  }

  await importGuests(
    candidates.map((c) => ({ name: c.name, phase: phaseOf(c.group), inviterNames: c.inviters, isPerformer: c.performer })),
    actor,
    FIX_SOURCE,
  );
  await setStatus(id, "resolved", "Different people: both added", actor);
  return true;
}
