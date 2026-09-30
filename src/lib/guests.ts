import { getDb } from "./db";
import type { PaymentKind } from "./payments";
import { formatPence } from "./money";

// Mirrors the CHECK constraints in migrations/0001_init.sql.
export const ATTENDANCE_VALUES = ["pending", "yes", "no"] as const;
export const CAMPING_VALUES = ["camping", "not_camping", "undecided"] as const;
export const VEHICLE_VALUES = ["none", "car", "campervan", "undecided"] as const;
// Not CHECK constraints in the database (see migrations/0013 and 0014):
// the app only ever writes these.
export const DAY_VALUES = ["thu", "fri", "sat", "sun", "mon", "unsure"] as const;
export const LIFT_VALUES = ["offer", "need"] as const;

export type Attendance = (typeof ATTENDANCE_VALUES)[number];
export type Camping = (typeof CAMPING_VALUES)[number];
export type Vehicle = (typeof VEHICLE_VALUES)[number];
export type Day = (typeof DAY_VALUES)[number];
export type Lift = (typeof LIFT_VALUES)[number];
export const INVITE_PHASES = ["1", "2", "3", "acts"] as const;
export type InvitePhase = (typeof INVITE_PHASES)[number];
export const PHASE_LABELS: Record<InvitePhase, string> = { "1": "Phase 1", "2": "Phase 2", "3": "Phase 3", acts: "Acts" };
/** RSVP lifecycle only; payment is tracked separately in PaymentStatus
 * (see migrations/0005_payment_status.sql). */
export type GuestStatus = "invited" | "viewed" | "rsvp_yes" | "rsvp_no" | "cancelled";
export type PaymentStatus = "unpaid" | "deposit_paid" | "paid_full";

export interface Guest {
  id: string;
  token: string;
  token_expires_at: string;
  ticket_ref: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  attendance: Attendance;
  arrival_day: Day | null;
  departure_day: Day | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  status: GuestStatus;
  payment_status: PaymentStatus;
  /** null = standard price, 0 = free, otherwise this guest's own price.
   * Only ever set for performers (see migrations/0006_performers.sql). */
  amount_due_pence: number | null;
  amount_paid_pence: number | null;
  payment_ref: string | null;
  checked_in_at: string | null;
  confirmation_email_sent_at: string | null;
  magic_link_sent_at: string | null;
  /** 0/1 (SQLite has no boolean). Set by hosts only. */
  is_performer: number;
  /** When their registration completed: said yes and either paid the
   * deposit or none was due (migrations/0009). null = details saved only. */
  registered_at: string | null;
  /** The guest's single open Stripe checkout (see migrations/0008). */
  checkout_session_id: string | null;
  checkout_session_url: string | null;
  checkout_amount_pence: number | null;
  checkout_expires_at: string | null;
  /** When a host sent (or marked as sent) their invite (migrations/0012). */
  invite_sent_at: string | null;
  /** Lift share (migrations/0014): offering a lift or asking for one. */
  lift: Lift | null;
  lift_from: string | null;
  lift_seats: number | null;
  /** Which round of invites they're in (migrations/0016): set by the
   * spreadsheet import, null for guests added by hand. */
  invite_phase: InvitePhase | null;
  created_at: string;
  updated_at: string;
}

export interface GuestWithInviters extends Guest {
  inviters: string[];
}

const TOKEN_EXPIRY_DAYS = 30;

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 30 days from now. Set when a link is sent (and when one's made, though
 * that only counts once it's sent: see linkExpiresAt). */
function newExpiry(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + TOKEN_EXPIRY_DAYS);
  return expires.toISOString();
}

/** When an unanswered link stops working: 30 days after it was sent
 * (markInviteSent sets it; sending again restarts it), or a fresh link's
 * 30 days (regenerateGuestLink). null while it's never been sent, or once
 * they've replied: those links don't expire. */
export function linkExpiresAt(guest: Pick<Guest, "attendance" | "token_expires_at" | "invite_sent_at">): string | null {
  if (guest.attendance !== "pending" || !guest.invite_sent_at) return null;
  return guest.token_expires_at;
}

/** True only when the guest was sent their link, hasn't replied, and it's
 * lapsed. */
export function isLinkExpired(guest: Pick<Guest, "attendance" | "token_expires_at" | "invite_sent_at">): boolean {
  const expires = linkExpiresAt(guest);
  return expires !== null && new Date(expires).getTime() < Date.now();
}

export async function getGuestByToken(token: string): Promise<Guest | null> {
  const db = getDb();
  const guest = await db.prepare("select * from guests where token = ?").bind(token).first<Guest>();
  return guest ?? null;
}

export async function getGuestsByEmail(email: string): Promise<Guest[]> {
  const trimmed = email.trim();
  if (!trimmed) return [];
  const db = getDb();
  const { results } = await db
    .prepare("select * from guests where lower(email) = lower(?)")
    .bind(trimmed)
    .all<Guest>();
  return results;
}

const EMAIL_COOLDOWN_MINUTES = 5;

function isOutsideEmailCooldown(lastSentAt: string | null): boolean {
  if (!lastSentAt) return true;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  return elapsedMs > EMAIL_COOLDOWN_MINUTES * 60 * 1000;
}

/** Guards the "email me my link" form against being used to spam a guest's
 * inbox by repeated submissions — silently skips sending (the caller still
 * shows the same generic "check your inbox" response either way). */
export function canSendMagicLink(guest: Pick<Guest, "magic_link_sent_at">): boolean {
  return isOutsideEmailCooldown(guest.magic_link_sent_at);
}

/** Same idea for RSVP confirmations: the guest chooses the address, so
 * without a cooldown anyone holding a link could resubmit in a loop to send
 * mail from our domain to any address. Answers still save every time; only
 * the email is skipped. */
export function canSendConfirmationEmail(guest: Pick<Guest, "confirmation_email_sent_at">): boolean {
  return isOutsideEmailCooldown(guest.confirmation_email_sent_at);
}

export async function markMagicLinkSent(guestId: string): Promise<void> {
  const db = getDb();
  await db.prepare("update guests set magic_link_sent_at = ? where id = ?").bind(nowIso(), guestId).run();
}

export async function getInvitersForGuest(guestId: string): Promise<string[]> {
  const db = getDb();
  const { results } = await db
    .prepare("select inviter_name from guest_inviters where guest_id = ? order by inviter_name")
    .bind(guestId)
    .all<{ inviter_name: string }>();
  return results.map((row) => row.inviter_name);
}

/** Marks a guest's link as opened, if this is their first visit. */
export async function markViewed(guest: Guest): Promise<void> {
  if (guest.status !== "invited") return;
  const db = getDb();
  await db.batch([
    db.prepare("update guests set status = 'viewed', updated_at = ? where id = ? and status = 'invited'").bind(nowIso(), guest.id),
    eventStatement(db, guest.id, "guest", "opened", "Opened their invite"),
  ]);
}

async function generateUniqueTicketRef(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const existing = await db.prepare("select id from guests where ticket_ref = ?").bind(candidate).first();
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique ticket reference");
}

export interface RsvpInput {
  attendance: Attendance;
  email: string | null;
  phone: string | null;
  arrivalDay: Day | null;
  departureDay: Day | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  lift: Lift | null;
  liftFrom: string | null;
  liftSeats: number | null;
}

export type SubmitRsvpResult =
  /** `wasReplied`: they'd already answered, so this is a change. */
  | { ok: true; guest: Guest; wasReplied: boolean }
  | { ok: false; reason: "not_found" | "expired" | "cancelled" };

/** Normalises a list of inviter names: trimmed, blanks dropped, and
 * duplicates removed (case-insensitively, keeping the first spelling) so
 * "Andrew, andrew" can't trip the unique (guest_id, inviter_name) index. */
export function normaliseInviterNames(inviterNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of inviterNames) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function insertInviterStatements(db: D1Database, guestId: string, inviterNames: string[]): D1PreparedStatement[] {
  return normaliseInviterNames(inviterNames).map((inviterName) =>
    db
      .prepare("insert into guest_inviters (id, guest_id, inviter_name) values (?, ?, ?)")
      .bind(newId(), guestId, inviterName),
  );
}

/** Shared by the guest-facing RSVP submit and the admin edit form, so both
 * paths generate a ticket_ref and update status the same way the moment
 * attendance becomes "yes" — an admin marking someone attending because
 * they were told verbally must produce a real ticket, same as a guest
 * submitting the form themselves.
 *
 * Returns a statement rather than running it, so callers can batch it with
 * their other writes (D1 runs a batch as a single transaction). */
async function rsvpFieldsStatement(
  db: D1Database,
  guestId: string,
  currentTicketRef: string | null,
  input: RsvpInput,
): Promise<D1PreparedStatement> {
  // ticket_ref is kept even if attendance later changes away from "yes",
  // so a guest who flips back gets the same QR code rather than a new one.
  let ticketRef = currentTicketRef;
  if (input.attendance === "yes" && !ticketRef) {
    ticketRef = await generateUniqueTicketRef(db);
  }

  // "pending" (only reachable via the admin form) resets an RSVP status
  // back to "viewed", so the admin list doesn't keep showing "Attending"
  // for someone whose answer has been cleared. A cancellation is a host
  // decision, so a guest resubmitting the form never undoes it.
  return db
    .prepare(
      `update guests set
         attendance = ?1, email = ?2, phone = ?3, arrival_day = ?4, departure_day = ?5,
         camping = ?6, vehicle = ?7, dietary = ?8, accessibility = ?9, notes = ?10,
         ticket_ref = ?11,
         status = case
           when status = 'cancelled' then status
           when ?1 = 'yes' then 'rsvp_yes'
           when ?1 = 'no' then 'rsvp_no'
           when status in ('rsvp_yes', 'rsvp_no') then 'viewed'
           else status
         end,
         -- No longer attending and nothing paid: they'll need to register
         -- (and pay a deposit, if due) again should they come back.
         registered_at = case
           when ?1 <> 'yes' and coalesce(amount_paid_pence, 0) <= 0 then null
           else registered_at
         end,
         lift = ?14, lift_from = ?15, lift_seats = ?16,
         updated_at = ?12
       where id = ?13`,
    )
    .bind(
      input.attendance,
      input.email,
      input.phone,
      input.arrivalDay,
      input.departureDay,
      input.camping,
      input.vehicle,
      input.dietary,
      input.accessibility,
      input.notes,
      ticketRef,
      nowIso(),
      guestId,
      // where from and how many seats only mean anything with a lift chosen
      input.lift,
      input.lift ? input.liftFrom : null,
      input.lift === "offer" ? input.liftSeats : null,
    );
}

async function getGuestRowById(db: D1Database, id: string): Promise<Guest> {
  const guest = await db.prepare("select * from guests where id = ?").bind(id).first<Guest>();
  if (!guest) throw new Error(`Guest ${id} not found`);
  return guest;
}

/** Re-validates the token and writes the RSVP. Token/expiry checks happen
 * again here (not just on page load) since this is a separate request. */
export async function submitRsvp(token: string, input: RsvpInput): Promise<SubmitRsvpResult> {
  const guest = await getGuestByToken(token);
  if (!guest) return { ok: false, reason: "not_found" };
  if (isLinkExpired(guest)) return { ok: false, reason: "expired" };
  if (guest.status === "cancelled") return { ok: false, reason: "cancelled" };

  const db = getDb();
  const wasReplied = guest.attendance !== "pending";
  const answer = input.attendance === "yes" ? "attending" : input.attendance === "no" ? "not attending" : "not answered";
  await db.batch([
    await rsvpFieldsStatement(db, guest.id, guest.ticket_ref, input),
    eventStatement(db, guest.id, "guest", "rsvp", wasReplied ? `Updated their RSVP (${answer})` : `RSVP'd: ${answer}`),
  ]);
  return { ok: true, guest: await getGuestRowById(db, guest.id), wasReplied };
}

export async function markConfirmationEmailSent(guestId: string): Promise<void> {
  const db = getDb();
  await db
    .prepare("update guests set confirmation_email_sent_at = ? where id = ?")
    .bind(nowIso(), guestId)
    .run();
}

// --- Admin ---

// Whitelisted ORDER BY clauses: the sort key comes from the query string,
// so it's only ever used to pick one of these, never interpolated.
export const GUEST_SORTS = {
  name: { label: "Name", orderBy: "g.name collate nocase" },
  status: { label: "Status", orderBy: "g.status, g.name collate nocase" },
  updated: { label: "Recently updated", orderBy: "g.updated_at desc" },
  // links that can expire (sent, no reply yet) first, soonest first
  expiry: {
    label: "Link expiry",
    orderBy: "case when g.attendance = 'pending' and g.invite_sent_at is not null then 0 else 1 end, g.token_expires_at",
  },
} as const;

export type GuestSort = keyof typeof GUEST_SORTS;

export function isGuestSort(value: string | null): value is GuestSort {
  return value !== null && Object.hasOwn(GUEST_SORTS, value);
}

// Whitelisted WHERE fragments for the list's "Show" filter, which double as
// the dashboard's counts (guestCounts) and its tiles' links.
const LIVE = "g.status <> 'cancelled'";
const ATTENDING = `g.attendance = 'yes' and ${LIVE}`;
export const GUEST_KINDS = {
  all: { label: "Everyone", where: null },
  guests: { label: "Guests only", where: "g.is_performer = 0" },
  performers: { label: "Performers only", where: "g.is_performer = 1" },
  notSent: { label: "Invite not sent yet", where: `g.invite_sent_at is null and ${LIVE}` },
  unopened: { label: "Sent, not opened yet", where: "g.status = 'invited' and g.invite_sent_at is not null" },
  waiting: { label: "Opened, no reply yet", where: "g.status = 'viewed'" },
  awaiting: { label: "Awaiting a reply", where: "g.status in ('invited', 'viewed')" },
  attending: { label: "Attending", where: ATTENDING },
  declined: { label: "Not attending", where: `g.attendance = 'no' and ${LIVE}` },
  onList: { label: "On the list", where: `${ATTENDING} and g.registered_at is not null` },
  depositDue: { label: "Deposit not paid", where: `${ATTENDING} and g.registered_at is null` },
  paidFull: { label: "Paid in full", where: `g.payment_status = 'paid_full' and ${LIVE}` },
  checkedIn: { label: "Checked in", where: "g.checked_in_at is not null" },
  camping: { label: "Camping", where: `g.camping = 'camping' and ${ATTENDING}` },
  vehicles: { label: "Bringing a vehicle", where: `g.vehicle in ('car', 'campervan') and ${ATTENDING}` },
  lifts: { label: "Lift share", where: `g.lift is not null and ${ATTENDING}` },
  cancelled: { label: "Cancelled", where: "g.status = 'cancelled'" },
  phase1: { label: "Phase 1", where: "g.invite_phase = '1'" },
  phase2: { label: "Phase 2", where: "g.invite_phase = '2'" },
  phase3: { label: "Phase 3", where: "g.invite_phase = '3'" },
  phaseActs: { label: "Acts", where: "g.invite_phase = 'acts'" },
} as const;

export type GuestKind = keyof typeof GUEST_KINDS;

export function isGuestKind(value: string | null): value is GuestKind {
  return value !== null && Object.hasOwn(GUEST_KINDS, value);
}

export interface GuestListOptions {
  inviter?: string;
  kind?: GuestKind;
  sort?: GuestSort;
  /** Search: part of a name, email address, phone number or ticket ref. */
  q?: string;
  /** Only this invite phase. */
  phase?: InvitePhase;
}

export async function listGuestsWithInviters({
  inviter,
  kind = "all",
  sort = "name",
  q,
  phase,
}: GuestListOptions = {}): Promise<GuestWithInviters[]> {
  const db = getDb();

  // Only whitelisted SQL fragments are interpolated; the one user-supplied
  // value (the inviter name) is always bound.
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (inviter) {
    conditions.push("g.id in (select guest_id from guest_inviters where inviter_name = ?)");
    bindings.push(inviter);
  }
  const kindWhere = GUEST_KINDS[kind].where;
  if (kindWhere) conditions.push(kindWhere);
  if (phase) {
    conditions.push("g.invite_phase = ?");
    bindings.push(phase);
  }
  const search = q?.trim();
  if (search) {
    // % and _ in the search are literal, not wildcards
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      "(g.name like ? escape '\\' or g.email like ? escape '\\' or g.phone like ? escape '\\' or g.ticket_ref like ? escape '\\')",
    );
    bindings.push(like, like, like, like);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const guestsStmt = db
    .prepare(`select g.* from guests g ${where} order by ${GUEST_SORTS[sort].orderBy}`)
    .bind(...bindings);

  const { results: guests } = await guestsStmt.all<Guest>();
  if (guests.length === 0) return [];

  const { results: inviterRows } = await db
    .prepare("select guest_id, inviter_name from guest_inviters")
    .all<{ guest_id: string; inviter_name: string }>();

  const invitersByGuest = new Map<string, string[]>();
  for (const row of inviterRows) {
    const list = invitersByGuest.get(row.guest_id) ?? [];
    list.push(row.inviter_name);
    invitersByGuest.set(row.guest_id, list);
  }

  return guests.map((guest) => ({
    ...guest,
    inviters: invitersByGuest.get(guest.id) ?? [],
  }));
}

/** How many guests fall under each "Show" filter, in one query. */
export async function guestCounts(): Promise<Record<GuestKind, number>> {
  const db = getDb();
  const sums = (Object.keys(GUEST_KINDS) as GuestKind[])
    .map((kind) => `sum(case when ${GUEST_KINDS[kind].where ?? "1"} then 1 else 0 end) as "${kind}"`)   // quoted: "all" is a keyword
    .join(", ");
  const row = await db.prepare(`select ${sums} from guests g`).first<Record<GuestKind, number | null>>();
  const counts = {} as Record<GuestKind, number>;
  for (const kind of Object.keys(GUEST_KINDS) as GuestKind[]) counts[kind] = row?.[kind] ?? 0;
  return counts;
}

export async function listAllInviterNames(): Promise<string[]> {
  const db = getDb();
  const { results } = await db
    .prepare("select distinct inviter_name from guest_inviters order by inviter_name")
    .all<{ inviter_name: string }>();
  return results.map((row) => row.inviter_name);
}

export async function getGuestById(id: string): Promise<GuestWithInviters | null> {
  const db = getDb();
  const guest = await db.prepare("select * from guests where id = ?").bind(id).first<Guest>();
  if (!guest) return null;
  const inviters = await getInvitersForGuest(id);
  return { ...guest, inviters };
}

/** Admin-only. amountDuePence only applies to performers, so it's stored as
 * null (standard price) whenever isPerformer is false. */
export interface PerformerInput {
  isPerformer: boolean;
  amountDuePence: number | null;
}

function performerColumns(input: PerformerInput): [number, number | null] {
  return input.isPerformer ? [1, input.amountDuePence] : [0, null];
}

/** True when a performer's price is set to £0: v2 skips payment for them. */
export function hasNothingToPay(guest: Pick<Guest, "is_performer" | "amount_due_pence">): boolean {
  return guest.is_performer === 1 && guest.amount_due_pence === 0;
}

export interface AddGuestInput extends PerformerInput {
  name: string;
  email: string | null;
  phone: string | null;
  inviterNames: string[];
}

export async function addGuest(input: AddGuestInput): Promise<Guest> {
  const db = getDb();
  const id = newId();
  const timestamp = nowIso();

  await db.batch([
    db
      .prepare(
        `insert into guests (id, token, token_expires_at, name, email, phone,
                             is_performer, amount_due_pence, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        newId(),
        newExpiry(),
        input.name,
        input.email,
        input.phone,
        ...performerColumns(input),
        timestamp,
        timestamp,
      ),
    ...insertInviterStatements(db, id, input.inviterNames),
  ]);

  return getGuestRowById(db, id);
}

export interface ImportGuestInput {
  name: string;
  phase: InvitePhase;
  inviterNames: string[];
  isPerformer: boolean;
}

export interface ImportResult {
  added: string[];
  /** Already on the list (same name, ignoring case), so left alone. */
  existing: string[];
}

/** Adds hosts to an existing guest's "Invited by" (the import's to-fix
 * list, when a possible duplicate turns out to be someone already there). */
export async function addInvitersToGuest(guestId: string, inviterNames: string[], actor: string, detail: string): Promise<void> {
  const db = getDb();
  await db.batch([
    ...normaliseInviterNames(inviterNames).map((name) =>
      db.prepare("insert or ignore into guest_inviters (id, guest_id, inviter_name) values (?, ?, ?)").bind(newId(), guestId, name),
    ),
    eventStatement(db, guestId, actor, "edited", detail),
  ]);
}

/** The spreadsheet import (/admin/import): adds each guest not already on
 * the list, with their phase, inviters and a history entry. Performers get
 * the standard price until a host sets theirs. */
export async function importGuests(
  guests: ImportGuestInput[],
  actor: string,
  source = "the spreadsheet",
): Promise<ImportResult> {
  const db = getDb();
  const { results } = await db.prepare("select lower(name) as name from guests").all<{ name: string }>();
  const onList = new Set(results.map((row) => row.name));
  const result: ImportResult = { added: [], existing: [] };
  const statements: D1PreparedStatement[] = [];
  for (const guest of guests) {
    if (onList.has(guest.name.toLowerCase())) {
      result.existing.push(guest.name);
      continue;
    }
    onList.add(guest.name.toLowerCase());
    const id = newId();
    const timestamp = nowIso();
    statements.push(
      db
        .prepare(
          `insert into guests (id, token, token_expires_at, name, is_performer, invite_phase, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, newId(), newExpiry(), guest.name, guest.isPerformer ? 1 : 0, guest.phase, timestamp, timestamp),
      ...insertInviterStatements(db, id, guest.inviterNames),
      eventStatement(db, id, actor, "imported", `Imported from ${source} (${PHASE_LABELS[guest.phase]})`),
    );
    result.added.push(guest.name);
  }
  // D1 batches are transactions; keep each one a sensible size
  for (let i = 0; i < statements.length; i += 90) await db.batch(statements.slice(i, i + 90));
  return result;
}

export interface EditGuestInput extends PerformerInput {
  name: string;
  email: string | null;
  phone: string | null;
  attendance: Attendance;
  arrivalDay: Day | null;
  departureDay: Day | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  lift: Lift | null;
  liftFrom: string | null;
  liftSeats: number | null;
  invitePhase: InvitePhase | null;
  inviterNames: string[];
}

/** All writes go in one batch, so a failure part-way (e.g. mid inviter
 * replace) can't leave a guest half-updated or stripped of inviters. */
export async function updateGuestAsAdmin(id: string, input: EditGuestInput, actor: string): Promise<void> {
  const db = getDb();
  const existing = await getGuestRowById(db, id);
  const existingInviters = await getInvitersForGuest(id);
  const changed = changedFields(existing, existingInviters, input);

  await db.batch([
    await rsvpFieldsStatement(db, id, existing.ticket_ref, input),
    db
      .prepare("update guests set name = ?, is_performer = ?, amount_due_pence = ?, invite_phase = ? where id = ?")
      .bind(input.name, ...performerColumns(input), input.invitePhase, id),
    // A performer's price may have changed, which can change their status.
    refreshPaymentStatusStatement(db, id),
    db.prepare("delete from guest_inviters where guest_id = ?").bind(id),
    ...insertInviterStatements(db, id, input.inviterNames),
    ...(changed.length ? [eventStatement(db, id, actor, "edited", `Changed ${changed.join(", ")}`)] : []),
  ]);
}

/** Which of a guest's details an admin edit changes, in words, for their
 * history. */
function changedFields(existing: Guest, existingInviters: string[], input: EditGuestInput): string[] {
  const pairs: [string, unknown, unknown][] = [
    ["name", existing.name, input.name],
    ["invited by", [...existingInviters].sort().join(","), normaliseInviterNames(input.inviterNames).sort().join(",")],
    ["email", existing.email, input.email],
    ["phone", existing.phone, input.phone],
    ["attendance", existing.attendance, input.attendance],
    ["arrival", existing.arrival_day, input.arrivalDay],
    ["departure", existing.departure_day, input.departureDay],
    ["camping", existing.camping, input.camping],
    ["vehicle", existing.vehicle, input.vehicle],
    ["dietary", existing.dietary, input.dietary],
    ["accessibility", existing.accessibility, input.accessibility],
    ["notes", existing.notes, input.notes],
    ["lift", `${existing.lift}|${existing.lift_from}|${existing.lift_seats}`, `${input.lift}|${input.lift ? input.liftFrom : null}|${input.lift === "offer" ? input.liftSeats : null}`],
    ["performer", existing.is_performer === 1, input.isPerformer],
    ["phase", existing.invite_phase, input.invitePhase],
    ["price", existing.is_performer === 1 ? existing.amount_due_pence : null, input.isPerformer ? input.amountDuePence : null],
  ];
  return pairs.filter(([, a, b]) => (a ?? null) !== (b ?? null)).map(([label]) => label);
}

/** guest_inviters rows go with it via "on delete cascade" — D1 enforces
 * foreign keys by default. */
export async function deleteGuest(id: string): Promise<void> {
  const db = getDb();
  await db.prepare("delete from guests where id = ?").bind(id).run();
}

/** New token + a fresh 30-day expiry. The old link stops working immediately
 * since it no longer matches any row. */
export async function regenerateGuestLink(id: string, actor: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.prepare("update guests set token = ?, token_expires_at = ?, updated_at = ? where id = ?").bind(newId(), newExpiry(), nowIso(), id),
    eventStatement(db, id, actor, "link", "Made a new link (the old one stopped working)"),
  ]);
}

/** Sent (copied from admin, or marked as sent another way) or not. Sending
 * starts an unanswered link's 30 days (sending again restarts them): links
 * don't expire before they've been sent (see linkExpiresAt). */
export async function markInviteSent(id: string, sent: boolean, actor: string, how: string): Promise<void> {
  const db = getDb();
  const now = nowIso();
  await db.batch([
    sent
      ? db
          .prepare(
            `update guests set invite_sent_at = ?1, updated_at = ?1,
               token_expires_at = case when attendance = 'pending' then ?2 else token_expires_at end
             where id = ?3`,
          )
          .bind(now, newExpiry(), id)
      : db.prepare("update guests set invite_sent_at = null, updated_at = ? where id = ?").bind(now, id),
    eventStatement(db, id, actor, "invite", sent ? `Invite sent (${how})` : "Marked invite not sent"),
  ]);
}

/** Checked in at the gate, or undone. */
export async function setCheckedIn(id: string, checkedIn: boolean, actor: string): Promise<void> {
  const db = getDb();
  const now = nowIso();
  await db.batch([
    db.prepare("update guests set checked_in_at = ?, updated_at = ? where id = ?").bind(checkedIn ? now : null, now, id),
    eventStatement(db, id, actor, "checkin", checkedIn ? "Checked in" : "Check-in undone"),
  ]);
}

export async function getGuestByTicketRef(ref: string): Promise<Guest | null> {
  const db = getDb();
  return (await db.prepare("select * from guests where ticket_ref = ?").bind(ref.toUpperCase()).first<Guest>()) ?? null;
}

// --- History ---

export interface GuestEvent {
  id: string;
  guest_id: string;
  at: string;
  /** A host's email (from Cloudflare Access), "guest", or "Stripe". */
  actor: string;
  action: string;
  detail: string | null;
}

/** A history entry, as a statement to batch with the change it records.
 * A fixed id (e.g. per payment) makes a repeat a no-op. */
export function eventStatement(
  db: D1Database,
  guestId: string,
  actor: string,
  action: string,
  detail: string | null = null,
  id: string = newId(),
): D1PreparedStatement {
  return db
    .prepare(
      `insert into guest_events (id, guest_id, at, actor, action, detail) values (?, ?, ?, ?, ?, ?)
       on conflict (id) do nothing`,
    )
    .bind(id, guestId, nowIso(), actor, action, detail);
}

export async function listGuestEvents(guestId: string): Promise<GuestEvent[]> {
  const db = getDb();
  const { results } = await db
    .prepare("select * from guest_events where guest_id = ? order by at desc, rowid desc")
    .bind(guestId)
    .all<GuestEvent>();
  return results;
}

/** Each guest's most recent history entry, for the admin list. */
export async function lastEventByGuest(): Promise<Map<string, GuestEvent>> {
  const db = getDb();
  const { results } = await db
    .prepare(
      `select e.* from guest_events e
       join (select guest_id, max(at) as at from guest_events group by guest_id) last
         on last.guest_id = e.guest_id and last.at = e.at`,
    )
    .all<GuestEvent>();
  return new Map(results.map((e) => [e.guest_id, e]));
}

/** When each guest first opened their invite link (link-preview fetches
 * don't count; see markViewed), for the admin list. Guests who opened it
 * before history was kept (migrations/0015) aren't in here. */
export async function openedAtByGuest(): Promise<Map<string, string>> {
  const db = getDb();
  const { results } = await db
    .prepare("select guest_id, min(at) as at from guest_events where action = 'opened' group by guest_id")
    .all<{ guest_id: string; at: string }>();
  return new Map(results.map((row) => [row.guest_id, row.at]));
}

// --- Payments (v2) ---

// A guest's current ticket price in SQL: their own price if set, otherwise
// the standard price from settings (absent when not decided yet).
const PRICE_SQL = `coalesce(amount_due_pence,
  (select cast(value as integer) from settings where key = 'standard_price_pence'))`;

// Mirrors paymentStatusFor() in src/lib/payments.ts — keep the two in step.
const PAYMENT_STATUS_SQL = `case
  when amount_paid_pence > 0 and ${PRICE_SQL} is not null and amount_paid_pence >= ${PRICE_SQL} then 'paid_full'
  when amount_paid_pence > 0 then 'deposit_paid'
  else 'unpaid'
end`;

/** Recomputes payment_status from the paid total and the current price, for
 * one guest or (with no id) everyone, e.g. after the standard price changes. */
export function refreshPaymentStatusStatement(db: D1Database, guestId?: string): D1PreparedStatement {
  return guestId
    ? db.prepare(`update guests set payment_status = ${PAYMENT_STATUS_SQL} where id = ?`).bind(guestId)
    : db.prepare(`update guests set payment_status = ${PAYMENT_STATUS_SQL}`);
}

export interface PaymentRow {
  id: string;
  guest_id: string;
  kind: PaymentKind;
  amount_pence: number;
  stripe_ref: string | null;
  note: string | null;
  created_at: string;
}

export interface RecordPaymentInput {
  /** Stripe Checkout Session id for card payments (makes a repeated webhook
   * delivery a no-op); omit for manual rows to get a fresh UUID. */
  id?: string;
  guestId: string;
  kind: PaymentKind;
  /** Negative for refunds. */
  amountPence: number;
  stripeRef?: string | null;
  note?: string | null;
  /** Who, for the guest's history: a host's email for manual entries;
   * "Stripe" by default. */
  actor?: string;
}

export type RecordPaymentResult =
  | { recorded: true; guest: Guest; completedRegistration: boolean }
  | { recorded: false; reason: "duplicate" | "guest_not_found" };

/** Adds a ledger row and brings the guest's totals in line, all in one D1
 * batch (a single transaction). amount_paid_pence is always recomputed from
 * the ledger rather than incremented, so it can't drift. */
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const db = getDb();
  const before = await db
    .prepare("select registered_at from guests where id = ?")
    .bind(input.guestId)
    .first<{ registered_at: string | null }>();
  if (!before) return { recorded: false, reason: "guest_not_found" };

  const id = input.id ?? newId();
  const [insert] = await db.batch([
    db
      .prepare(
        `insert into payments (id, guest_id, kind, amount_pence, stripe_ref, note, created_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (id) do nothing`,
      )
      .bind(id, input.guestId, input.kind, input.amountPence, input.stripeRef ?? null, input.note ?? null, nowIso()),
    // Statements in an UPDATE's SET list all see the old row, so the paid
    // total and the status derived from it are two statements.
    db
      .prepare(
        `update guests set
           amount_paid_pence = (select coalesce(sum(amount_pence), 0) from payments where guest_id = ?1),
           payment_ref = coalesce(?2, payment_ref),
           updated_at = ?3
         where id = ?1`,
      )
      .bind(input.guestId, input.stripeRef ?? null, nowIso()),
    refreshPaymentStatusStatement(db, input.guestId),
    // Money in (a deposit, usually) completes an attending guest's
    // registration.
    db
      .prepare(
        `update guests set registered_at = ?
         where id = ? and registered_at is null and attendance = 'yes' and ? > 0`,
      )
      .bind(nowIso(), input.guestId, input.amountPence),
    // A completed checkout is no longer "open".
    db
      .prepare(
        `update guests set checkout_session_id = null, checkout_session_url = null,
           checkout_amount_pence = null, checkout_expires_at = null
         where id = ? and checkout_session_id = ?`,
      )
      .bind(input.guestId, id),
    // its history entry shares the payment's id, so a repeat delivery
    // can't log it twice either
    eventStatement(
      db,
      input.guestId,
      input.actor ?? "Stripe",
      "payment",
      input.amountPence < 0
        ? `Refund recorded: ${formatPence(-input.amountPence)}`
        : `${input.kind === "manual" ? "Payment recorded" : input.kind === "balance" ? "Paid the balance" : "Paid the deposit"}: ${formatPence(input.amountPence)}`,
      `payment-${id}`,
    ),
  ]);

  if (insert.meta.changes === 0) return { recorded: false, reason: "duplicate" };
  const guest = await getGuestRowById(db, input.guestId);
  return { recorded: true, guest, completedRegistration: !before.registered_at && Boolean(guest.registered_at) };
}

export async function listPaymentsForGuest(guestId: string): Promise<PaymentRow[]> {
  const db = getDb();
  const { results } = await db
    .prepare("select * from payments where guest_id = ? order by created_at")
    .bind(guestId)
    .all<PaymentRow>();
  return results;
}

export interface OpenCheckout {
  sessionId: string;
  url: string;
  amountPence: number;
  expiresAt: string;
}

/** Records a new checkout as the guest's open one — but only if they don't
 * already have one that's still live. Atomic, so of two simultaneous clicks
 * exactly one wins; the loser must expire its own session. */
export async function claimCheckout(guestId: string, checkout: OpenCheckout): Promise<boolean> {
  const db = getDb();
  const result = await db
    .prepare(
      `update guests set checkout_session_id = ?, checkout_session_url = ?,
         checkout_amount_pence = ?, checkout_expires_at = ?
       where id = ? and (checkout_session_id is null or checkout_expires_at < ?)`,
    )
    .bind(checkout.sessionId, checkout.url, checkout.amountPence, checkout.expiresAt, guestId, nowIso())
    .run();
  return result.meta.changes === 1;
}

/** Forgets the guest's open checkout, if it's still the given session (so a
 * late "expired" webhook can't clear a newer checkout). */
export async function clearCheckout(guestId: string, sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      `update guests set checkout_session_id = null, checkout_session_url = null,
         checkout_amount_pence = null, checkout_expires_at = null
       where id = ? and checkout_session_id = ?`,
    )
    .bind(guestId, sessionId)
    .run();
}

/** Cancelling is a host decision (usually alongside a refund recorded in
 * Stripe). Reinstating puts the RSVP status back from their attendance. */
export async function setGuestCancelled(id: string, cancelled: boolean, actor: string): Promise<void> {
  const db = getDb();
  const status = cancelled
    ? "'cancelled'"
    : `case attendance when 'yes' then 'rsvp_yes' when 'no' then 'rsvp_no' else 'viewed' end`;
  await db.batch([
    db.prepare(`update guests set status = ${status}, updated_at = ? where id = ?`).bind(nowIso(), id),
    eventStatement(db, id, actor, "cancel", cancelled ? "Place cancelled" : "Place reinstated"),
  ]);
}

export type PaymentSummaryRow = Pick<
  Guest,
  | "id"
  | "name"
  | "attendance"
  | "status"
  | "ticket_ref"
  | "is_performer"
  | "amount_due_pence"
  | "amount_paid_pence"
  | "payment_status"
  | "registered_at"
>;

/** Just the columns the admin Payments page needs to total things up. */
export async function listGuestsForPayments(): Promise<PaymentSummaryRow[]> {
  const db = getDb();
  const { results } = await db
    .prepare(
      `select id, name, attendance, status, ticket_ref, is_performer, amount_due_pence,
              amount_paid_pence, payment_status, registered_at
       from guests order by name collate nocase`,
    )
    .all<PaymentSummaryRow>();
  return results;
}

/** Completes an attending guest's registration when no deposit is due
 * (deposits closed, or a free performer). No-op if already registered. */
export async function markRegistered(guestId: string): Promise<void> {
  const db = getDb();
  await db
    .prepare("update guests set registered_at = ? where id = ? and registered_at is null and attendance = 'yes'")
    .bind(nowIso(), guestId)
    .run();
}
