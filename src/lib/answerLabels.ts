// How a guest's choices read to them: the RSVP form's own wording, used on
// their page and in their emails. (Pure, so emails can use it in tests.)

export const CAMPING_LABELS: Record<string, string> = {
  camping: "Camping",
  not_camping: "Not camping",
  undecided: "Undecided",
};

export const VEHICLE_LABELS: Record<string, string> = {
  none: "Nope",
  campervan: "Bringing a campervan",
  car: "Bringing a car",
  undecided: "Undecided",
};

// Arrival and departure are one of these (migrations/0013), shown with
// their date: the festival is Friday 13 to Sunday 15 August 2027.
export const DAY_LABELS: Record<string, string> = {
  thu: "Thursday 12 August",
  fri: "Friday 13 August",
  sat: "Saturday 14 August",
  sun: "Sunday 15 August",
  mon: "Monday 16 August",
  unsure: "Not sure yet",
};

// Lift share (migrations/0014).
export const LIFT_LABELS: Record<string, string> = {
  offer: "I can offer a lift",
  need: "I'd like a lift",
};

// Glamping pod interest (migrations/0018): not a booking.
export const GLAMPING_LABELS: Record<string, string> = {
  interested: "Interested in a glamping pod",
  maybe: "Might be interested in a glamping pod",
};

/** "Can offer a lift from Bristol (3 spare seats)", or null for no lift. */
export function liftSummary(guest: { lift: string | null; lift_from: string | null; lift_seats: number | null }): string | null {
  if (!guest.lift) return null;
  const from = guest.lift_from ? ` from ${guest.lift_from}` : "";
  if (guest.lift === "need") return `Would like a lift${from}`;
  const seats = guest.lift_seats === null ? "" : ` (${guest.lift_seats} spare ${guest.lift_seats === 1 ? "seat" : "seats"})`;
  return `Can offer a lift${from}${seats}`;
}
