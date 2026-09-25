import { getDb } from "./db";

// Mirrors the CHECK constraints in migrations/0001_init.sql.
export const ATTENDANCE_VALUES = ["pending", "yes", "no"] as const;
export const CAMPING_VALUES = ["camping", "not_camping", "undecided"] as const;
export const VEHICLE_VALUES = ["none", "car", "campervan", "undecided"] as const;

export type Attendance = (typeof ATTENDANCE_VALUES)[number];
export type Camping = (typeof CAMPING_VALUES)[number];
export type Vehicle = (typeof VEHICLE_VALUES)[number];
export type GuestStatus =
  | "invited"
  | "viewed"
  | "rsvp_yes"
  | "rsvp_no"
  | "deposit_paid"
  | "paid_full"
  | "cancelled";

export interface Guest {
  id: string;
  token: string;
  token_expires_at: string;
  ticket_ref: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  attendance: Attendance;
  arrival_day: string | null;
  departure_day: string | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  status: GuestStatus;
  amount_due_pence: number | null;
  amount_paid_pence: number | null;
  payment_ref: string | null;
  checked_in_at: string | null;
  confirmation_email_sent_at: string | null;
  magic_link_sent_at: string | null;
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

function newExpiry(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + TOKEN_EXPIRY_DAYS);
  return expires.toISOString();
}

/** True only when the guest hasn't responded yet and their link has lapsed. */
export function isLinkExpired(guest: Pick<Guest, "attendance" | "token_expires_at">): boolean {
  if (guest.attendance !== "pending") return false;
  return new Date(guest.token_expires_at).getTime() < Date.now();
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
  await db
    .prepare("update guests set status = 'viewed', updated_at = ? where id = ?")
    .bind(nowIso(), guest.id)
    .run();
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
  arrivalDay: string | null;
  departureDay: string | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
}

export type SubmitRsvpResult =
  | { ok: true; guest: Guest }
  | { ok: false; reason: "not_found" | "expired" };

/** Normalises a list of inviter names: trimmed, blanks dropped, and
 * duplicates removed (case-insensitively, keeping the first spelling) so
 * "Andrew, andrew" can't trip the unique (guest_id, inviter_name) index. */
function normaliseInviterNames(inviterNames: string[]): string[] {
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
  // for someone whose answer has been cleared.
  return db
    .prepare(
      `update guests set
         attendance = ?1, email = ?2, phone = ?3, arrival_day = ?4, departure_day = ?5,
         camping = ?6, vehicle = ?7, dietary = ?8, accessibility = ?9, notes = ?10,
         ticket_ref = ?11,
         status = case ?1
           when 'yes' then 'rsvp_yes'
           when 'no' then 'rsvp_no'
           else case when status in ('rsvp_yes', 'rsvp_no') then 'viewed' else status end
         end,
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

  const db = getDb();
  await (await rsvpFieldsStatement(db, guest.id, guest.ticket_ref, input)).run();
  return { ok: true, guest: await getGuestRowById(db, guest.id) };
}

export async function markConfirmationEmailSent(guestId: string): Promise<void> {
  const db = getDb();
  await db
    .prepare("update guests set confirmation_email_sent_at = ? where id = ?")
    .bind(nowIso(), guestId)
    .run();
}

// --- Admin ---

export async function listGuestsWithInviters(inviterFilter?: string): Promise<GuestWithInviters[]> {
  const db = getDb();

  const guestsStmt = inviterFilter
    ? db
        .prepare(
          `select g.* from guests g
           join guest_inviters gi on gi.guest_id = g.id
           where gi.inviter_name = ?
           order by g.name`,
        )
        .bind(inviterFilter)
    : db.prepare("select * from guests order by name");

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

export interface AddGuestInput {
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
        `insert into guests (id, token, token_expires_at, name, email, phone, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, newId(), newExpiry(), input.name, input.email, input.phone, timestamp, timestamp),
    ...insertInviterStatements(db, id, input.inviterNames),
  ]);

  return getGuestRowById(db, id);
}

export interface EditGuestInput {
  name: string;
  email: string | null;
  phone: string | null;
  attendance: Attendance;
  arrivalDay: string | null;
  departureDay: string | null;
  camping: Camping | null;
  vehicle: Vehicle | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  inviterNames: string[];
}

/** All writes go in one batch, so a failure part-way (e.g. mid inviter
 * replace) can't leave a guest half-updated or stripped of inviters. */
export async function updateGuestAsAdmin(id: string, input: EditGuestInput): Promise<void> {
  const db = getDb();
  const existing = await getGuestRowById(db, id);

  await db.batch([
    await rsvpFieldsStatement(db, id, existing.ticket_ref, input),
    db.prepare("update guests set name = ? where id = ?").bind(input.name, id),
    db.prepare("delete from guest_inviters where guest_id = ?").bind(id),
    ...insertInviterStatements(db, id, input.inviterNames),
  ]);
}

/** guest_inviters rows go with it via "on delete cascade" — D1 enforces
 * foreign keys by default. */
export async function deleteGuest(id: string): Promise<void> {
  const db = getDb();
  await db.prepare("delete from guests where id = ?").bind(id).run();
}

/** New token + a fresh 30-day expiry. The old link stops working immediately
 * since it no longer matches any row. */
export async function regenerateGuestLink(id: string): Promise<void> {
  const db = getDb();
  await db
    .prepare("update guests set token = ?, token_expires_at = ?, updated_at = ? where id = ?")
    .bind(newId(), newExpiry(), nowIso(), id)
    .run();
}
