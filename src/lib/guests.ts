import { getSupabaseClient } from "./supabase";

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
  created_at: string;
  updated_at: string;
}

export interface GuestWithInviters extends Guest {
  inviters: string[];
}

const TOKEN_EXPIRY_DAYS = 30;

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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("guests")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error) throw error;
  return data as Guest | null;
}

export async function getInvitersForGuest(guestId: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("guest_inviters")
    .select("inviter_name")
    .eq("guest_id", guestId)
    .order("inviter_name");

  if (error) throw error;
  return (data ?? []).map((row) => row.inviter_name as string);
}

/** Marks a guest's link as opened, if this is their first visit. */
export async function markViewed(guest: Guest): Promise<void> {
  if (guest.status !== "invited") return;
  const supabase = getSupabaseClient();
  await supabase.from("guests").update({ status: "viewed" }).eq("id", guest.id);
}

async function generateUniqueTicketRef(): Promise<string> {
  const supabase = getSupabaseClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const { data, error } = await supabase
      .from("guests")
      .select("id")
      .eq("ticket_ref", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
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

/** Re-validates the token and writes the RSVP. Token/expiry checks happen
 * again here (not just on page load) since this is a separate request. */
export async function submitRsvp(token: string, input: RsvpInput): Promise<SubmitRsvpResult> {
  const guest = await getGuestByToken(token);
  if (!guest) return { ok: false, reason: "not_found" };
  if (isLinkExpired(guest)) return { ok: false, reason: "expired" };

  const supabase = getSupabaseClient();

  let ticketRef = guest.ticket_ref;
  if (input.attendance === "yes" && !ticketRef) {
    ticketRef = await generateUniqueTicketRef();
  }

  const { data, error } = await supabase
    .from("guests")
    .update({
      attendance: input.attendance,
      email: input.email,
      phone: input.phone,
      arrival_day: input.arrivalDay,
      departure_day: input.departureDay,
      camping: input.camping,
      vehicle: input.vehicle,
      dietary: input.dietary,
      accessibility: input.accessibility,
      notes: input.notes,
      status: input.attendance === "yes" ? "rsvp_yes" : "rsvp_no",
      ticket_ref: ticketRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guest.id)
    .select("*")
    .single();

  if (error) throw error;
  return { ok: true, guest: data as Guest };
}

export async function markConfirmationEmailSent(guestId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from("guests")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", guestId);
}

// --- Admin ---

export async function listGuestsWithInviters(inviterFilter?: string): Promise<GuestWithInviters[]> {
  const supabase = getSupabaseClient();

  let guestIdsForFilter: string[] | null = null;
  if (inviterFilter) {
    const { data, error } = await supabase
      .from("guest_inviters")
      .select("guest_id")
      .eq("inviter_name", inviterFilter);
    if (error) throw error;
    guestIdsForFilter = (data ?? []).map((row) => row.guest_id as string);
    if (guestIdsForFilter.length === 0) return [];
  }

  let query = supabase.from("guests").select("*").order("name");
  if (guestIdsForFilter) {
    query = query.in("id", guestIdsForFilter);
  }

  const { data: guests, error } = await query;
  if (error) throw error;

  const { data: inviterRows, error: invitersError } = await supabase
    .from("guest_inviters")
    .select("guest_id, inviter_name");
  if (invitersError) throw invitersError;

  const invitersByGuest = new Map<string, string[]>();
  for (const row of inviterRows ?? []) {
    const list = invitersByGuest.get(row.guest_id as string) ?? [];
    list.push(row.inviter_name as string);
    invitersByGuest.set(row.guest_id as string, list);
  }

  return (guests ?? []).map((guest) => ({
    ...(guest as Guest),
    inviters: invitersByGuest.get((guest as Guest).id) ?? [],
  }));
}

export async function listAllInviterNames(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("guest_inviters")
    .select("inviter_name")
    .order("inviter_name");
  if (error) throw error;
  const unique = Array.from(new Set((data ?? []).map((row) => row.inviter_name as string)));
  return unique;
}

export async function getGuestById(id: string): Promise<GuestWithInviters | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("guests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const inviters = await getInvitersForGuest(id);
  return { ...(data as Guest), inviters };
}

export interface AddGuestInput {
  name: string;
  email: string | null;
  phone: string | null;
  inviterNames: string[];
}

export async function addGuest(input: AddGuestInput): Promise<Guest> {
  const supabase = getSupabaseClient();
  const { data: guest, error } = await supabase
    .from("guests")
    .insert({ name: input.name, email: input.email, phone: input.phone })
    .select("*")
    .single();
  if (error) throw error;

  const inviterRows = input.inviterNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((inviter_name) => ({ guest_id: (guest as Guest).id, inviter_name }));

  if (inviterRows.length > 0) {
    const { error: invitersError } = await supabase.from("guest_inviters").insert(inviterRows);
    if (invitersError) throw invitersError;
  }

  return guest as Guest;
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
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("guests")
    .update({
      name: input.name,
      email: input.email,
      phone: input.phone,
      attendance: input.attendance,
      arrival_day: input.arrivalDay,
      departure_day: input.departureDay,
      camping: input.camping,
      vehicle: input.vehicle,
      dietary: input.dietary,
      accessibility: input.accessibility,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  const { error: deleteError } = await supabase.from("guest_inviters").delete().eq("guest_id", id);
  if (deleteError) throw deleteError;

  const inviterRows = input.inviterNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((inviter_name) => ({ guest_id: id, inviter_name }));

  if (inviterRows.length > 0) {
    const { error: insertError } = await supabase.from("guest_inviters").insert(inviterRows);
    if (insertError) throw insertError;
  }
}

/** New token + a fresh 30-day expiry. The old link stops working immediately
 * since it no longer matches any row. */
export async function regenerateGuestLink(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("guests")
    .update({
      token: crypto.randomUUID(),
      token_expires_at: newExpiry(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
