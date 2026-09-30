// The hosts' planning report (/admin/report): who's arriving when, who's
// on site each night, camping, vehicles, food, access, performers, lifts,
// and a check-in sheet. Pure, so it's unit-tested.
import { DAY_VALUES, type Day, type Guest, type GuestWithInviters } from "./guests";

/** The festival's days in order (not "unsure"). */
export const FESTIVAL_DAYS = DAY_VALUES.filter((day): day is Exclude<Day, "unsure"> => day !== "unsure");
type FestivalDay = (typeof FESTIVAL_DAYS)[number];

/** Nights on site, named by the evening they start (Thursday night, …). */
export const NIGHTS = FESTIVAL_DAYS.slice(0, -1);

export interface NamedNote {
  name: string;
  note: string;
}

export interface LiftGroup {
  /** Where from, as the first person typed it ("Anywhere" if blank). */
  from: string;
  offers: { name: string; seats: number | null; contact: string | null }[];
  needs: { name: string; contact: string | null }[];
}

export interface CheckInRow {
  name: string;
  ticketRef: string | null;
  payment: string;
  /** Their arrival day (e.g. "fri"), if they've said. */
  arrival: Day | null;
  checkedIn: boolean;
}

export interface Report {
  attending: number;
  arrivals: Record<Day | "unset", number>;
  departures: Record<Day | "unset", number>;
  /** Guests on site each night, counting only those who gave both days. */
  nights: Record<FestivalDay, number>;
  /** How many attending guests haven't given both days (or aren't sure). */
  datesUnknown: number;
  camping: Record<"camping" | "not_camping" | "undecided" | "unset", number>;
  vehicles: Record<"car" | "campervan" | "none" | "undecided" | "unset", number>;
  dietary: NamedNote[];
  accessibility: NamedNote[];
  notes: NamedNote[];
  performers: string[];
  lifts: LiftGroup[];
  checkIn: CheckInRow[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" });

function counts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

/** Coming: said yes and not cancelled. */
export function isComing(guest: Pick<Guest, "attendance" | "status">): boolean {
  return guest.attendance === "yes" && guest.status !== "cancelled";
}

function paymentLabel(guest: Guest): string {
  if (guest.payment_status === "paid_full") return "Paid";
  if (guest.payment_status === "deposit_paid") return "Deposit paid";
  return guest.registered_at ? "Nothing due yet" : "Deposit not paid";
}

function contact(guest: Guest): string | null {
  return [guest.phone, guest.email].filter(Boolean).join(" · ") || null;
}

export function buildReport(allGuests: (Guest | GuestWithInviters)[]): Report {
  const guests = allGuests.filter(isComing).sort(byName);
  const dayKeys = [...DAY_VALUES, "unset"] as const;
  const report: Report = {
    attending: guests.length,
    arrivals: counts(dayKeys),
    departures: counts(dayKeys),
    nights: counts(FESTIVAL_DAYS),
    datesUnknown: 0,
    camping: counts(["camping", "not_camping", "undecided", "unset"] as const),
    vehicles: counts(["car", "campervan", "none", "undecided", "unset"] as const),
    dietary: [],
    accessibility: [],
    notes: [],
    performers: [],
    lifts: [],
    checkIn: [],
  };
  const lifts = new Map<string, LiftGroup>();

  for (const guest of guests) {
    report.arrivals[guest.arrival_day ?? "unset"]++;
    report.departures[guest.departure_day ?? "unset"]++;
    const from = FESTIVAL_DAYS.indexOf(guest.arrival_day as FestivalDay);
    const to = FESTIVAL_DAYS.indexOf(guest.departure_day as FestivalDay);
    if (from === -1 || to === -1) report.datesUnknown++;
    // on site the nights from arrival up to (not including) departure
    else for (let night = from; night < to; night++) report.nights[FESTIVAL_DAYS[night]]++;

    report.camping[guest.camping ?? "unset"]++;
    report.vehicles[guest.vehicle ?? "unset"]++;
    if (guest.dietary?.trim()) report.dietary.push({ name: guest.name, note: guest.dietary.trim() });
    if (guest.accessibility?.trim()) report.accessibility.push({ name: guest.name, note: guest.accessibility.trim() });
    if (guest.notes?.trim()) report.notes.push({ name: guest.name, note: guest.notes.trim() });
    if (guest.is_performer === 1) report.performers.push(guest.name);

    if (guest.lift) {
      const place = guest.lift_from?.trim() || "Anywhere";
      const key = place.toLocaleLowerCase("en-GB");
      const group = lifts.get(key) ?? { from: place, offers: [], needs: [] };
      if (guest.lift === "offer") group.offers.push({ name: guest.name, seats: guest.lift_seats, contact: contact(guest) });
      else group.needs.push({ name: guest.name, contact: contact(guest) });
      lifts.set(key, group);
    }

    report.checkIn.push({
      name: guest.name,
      ticketRef: guest.ticket_ref,
      payment: paymentLabel(guest),
      arrival: guest.arrival_day,
      checkedIn: guest.checked_in_at !== null,
    });
  }

  report.lifts = [...lifts.values()].sort((a, b) =>
    a.from === "Anywhere" ? 1 : b.from === "Anywhere" ? -1 : a.from.localeCompare(b.from, "en-GB"),
  );
  return report;
}
