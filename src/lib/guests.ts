import { getDb } from "./db";

export type Attendance = "pending" | "yes" | "no";
export type Camping = "camping" | "not_camping" | "undecided";
export type Vehicle = "none" | "car" | "campervan" | "undecided";
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

const MAGIC_LINK_COOLDOWN_MINUTES = 5;

/** Guards the "email me my link" form against being used to spam a guest's
 * inbox by repeated submissions — silently skips sending (the caller still
 * shows the same generic "check your inbox" response either way). */
export function canSendMagicLink(guest: Pick<Guest, "magic_link_sent_at">): boolean {
  if (!guest.magic_link_sent_at) return true;
  const elapsedMs = Date.now() - new Date(guest.magic_link_sent_at).getTime();
  return elapsedMs > MAGIC_LINK_COOLDOWN_MINUTES * 60 * 1000;
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

/** Shared by the guest-facing RSVP submit and the admin edit form, so both
 * paths generate a ticket_ref and update status the same way the moment
 * attendance becomes "yes" — an admin marking someone attending because
 * they were told verbally must produce a real ticket, same as a guest
 * submitting the form themselves. */
async function writeRsvpFields(
  guestId: string,
  currentTicketRef: string | null,
  input: RsvpInput,
): Promise<Guest> {
  const db = getDb();

  let ticketRef = currentTicketRef;
  if (input.attendance === "yes" && !ticketRef) {
    ticketRef = await generateUniqueTicketRef(db);
  }

  const statusForAttendance: Record<Attendance, GuestStatus | null> = {
    yes: "rsvp_yes",
    no: "rsvp_no",
    pending: null,
  };

  await db
    .prepare(
      `update guests set
         attendance = ?, email = ?, phone = ?, arrival_day = ?, departure_day = ?,
         camping = ?, vehicle = ?, dietary = ?, accessibility = ?, notes = ?,
         ticket_ref = ?, status = coalesce(?, status), updated_at = ?
       where id = ?`,
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
      statusForAttendance[input.attendance],
      nowIso(),
      guestId,
    )
    .run();

  const updated = await db.prepare("select * from guests where id = ?").bind(guestId).first<Guest>();
  if (!updated) throw new Error(`Guest ${guestId} not found after update`);
  return updated;
}

/** Re-validates the token and writes the RSVP. Token/expiry checks happen
 * again here (not just on page load) since this is a separate request. */
export async function submitRsvp(token: string, input: RsvpInput): Promise<SubmitRsvpResult> {
  const guest = await getGuestByToken(token);
  if (!guest) return { ok: false, reason: "not_found" };
  if (isLinkExpired(guest)) return { ok: false, reason: "expired" };

  const updated = await writeRsvpFields(guest.id, guest.ticket_ref, input);
  return { ok: true, guest: updated };
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

async function replaceInviters(db: D1Database, guestId: string, inviterNames: string[]): Promise<void> {
  const names = inviterNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return;
  await db.batch(
    names.map((inviter_name) =>
      db
        .prepare("insert into guest_inviters (id, guest_id, inviter_name) values (?, ?, ?)")
        .bind(newId(), guestId, inviter_name),
    ),
  );
}

export async function addGuest(input: AddGuestInput): Promise<Guest> {
  const db = getDb();
  const id = newId();
  const timestamp = nowIso();

  await db
    .prepare(
      `insert into guests (id, token, token_expires_at, name, email, phone, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, newId(), newExpiry(), input.name, input.email, input.phone, timestamp, timestamp)
    .run();

  await replaceInviters(db, id, input.inviterNames);

  const guest = await db.prepare("select * from guests where id = ?").bind(id).first<Guest>();
  if (!guest) throw new Error("Failed to create guest");
  return guest;
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

export async function updateGuestAsAdmin(id: string, input: EditGuestInput): Promise<void> {
  const db = getDb();

  const existing = await getGuestById(id);
  if (!existing) throw new Error(`Guest ${id} not found`);

  await writeRsvpFields(id, existing.ticket_ref, input);

  await db.prepare("update guests set name = ? where id = ?").bind(input.name, id).run();

  await db.prepare("delete from guest_inviters where guest_id = ?").bind(id).run();
  await replaceInviters(db, id, input.inviterNames);
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
