import type { APIRoute } from "astro";
import { linkExpiresAt, listGuestsWithInviters } from "../../../lib/guests";
import { getPaymentSettings } from "../../../lib/settings";
import { ticketPrice } from "../../../lib/payments";
import { CAMPING_LABELS, DAY_LABELS, LIFT_LABELS, VEHICLE_LABELS } from "../../../lib/answerLabels";
import { toCsv } from "../../../lib/csv";
import { SITE_URL } from "astro:env/server";

export const prerender = false;

const pounds = (pence: number | null) => (pence === null ? null : (pence / 100).toFixed(2));
const label = (labels: Record<string, string>, value: string | null) => (value ? (labels[value] ?? value) : null);

/** Every guest and everything we know about them, for a spreadsheet. */
export const GET: APIRoute = async () => {
  const [guests, settings] = await Promise.all([listGuestsWithInviters({ sort: "name" }), getPaymentSettings()]);
  const rows = [
    [
      "Name", "Invited by", "Status", "Attending", "Email", "Phone",
      "Arrival", "Departure", "Camping", "Vehicle", "Lift", "Lift from", "Spare seats",
      "Dietary", "Accessibility", "Notes", "Performer",
      "Price (£)", "Paid (£)", "Payment", "On the list since", "Ticket", "Checked in",
      "Invite sent", "Link", "Link expires",
    ],
    ...guests.map((g) => [
      g.name, g.inviters.join(", "), g.status, g.attendance, g.email, g.phone,
      label(DAY_LABELS, g.arrival_day), label(DAY_LABELS, g.departure_day),
      label(CAMPING_LABELS, g.camping), label(VEHICLE_LABELS, g.vehicle),
      label(LIFT_LABELS, g.lift), g.lift_from, g.lift_seats,
      g.dietary, g.accessibility, g.notes, g.is_performer === 1 ? "Yes" : "No",
      pounds(ticketPrice(g, settings)), pounds(g.amount_paid_pence ?? 0), g.payment_status, g.registered_at, g.ticket_ref, g.checked_in_at,
      g.invite_sent_at, new URL(`/rsvp/${g.token}`, SITE_URL).toString(), linkExpiresAt(g),
    ]),
  ];
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="over-the-hill-guests-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
