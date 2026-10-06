import { describe, expect, it } from "vitest";
import { buildReport } from "../src/lib/report";
import { csvCell, toCsv } from "../src/lib/csv";
import { liftSummary } from "../src/lib/answerLabels";
import { inviteMessage } from "../src/lib/site";
import type { Guest } from "../src/lib/guests";

function guest(overrides: Partial<Guest>): Guest {
  return {
    id: overrides.name ?? "g",
    token: "t",
    token_expires_at: "2027-06-01T00:00:00Z",
    ticket_ref: null,
    name: "Guest",
    email: null,
    phone: null,
    attendance: "yes",
    arrival_day: null,
    departure_day: null,
    camping: null,
    vehicle: null,
    dietary: null,
    accessibility: null,
    notes: null,
    status: "rsvp_yes",
    payment_status: "unpaid",
    amount_due_pence: null,
    amount_paid_pence: 0,
    payment_ref: null,
    checked_in_at: null,
    confirmation_email_sent_at: null,
    magic_link_sent_at: null,
    is_performer: 0,
    registered_at: null,
    checkout_session_id: null,
    checkout_session_url: null,
    checkout_amount_pence: null,
    checkout_expires_at: null,
    invite_sent_at: null,
    lift: null,
    lift_from: null,
    lift_seats: null,
    glamping: null,
    invite_phase: null,
    created_at: "2027-01-01T00:00:00Z",
    updated_at: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildReport", () => {
  const report = buildReport([
    guest({ name: "Bea", arrival_day: "fri", departure_day: "sun", camping: "camping", vehicle: "car", dietary: " Vegan ", lift: "offer", lift_from: "Bristol", lift_seats: 3, phone: "07700" }),
    guest({ name: "al", arrival_day: "thu", departure_day: "mon", vehicle: "campervan", is_performer: 1, lift: "need", lift_from: "bristol " }),
    guest({ name: "Cat", arrival_day: "sat", departure_day: "unsure", lift: "need", glamping: "maybe", email: "cat@example.com" }),
    guest({ name: "Declined", attendance: "no", status: "rsvp_no", arrival_day: "fri", departure_day: "sun" }),
    guest({ name: "Cancelled", status: "cancelled", arrival_day: "fri", departure_day: "sun", dietary: "Nuts" }),
    guest({ name: "Pending", attendance: "pending", status: "invited" }),
  ]);

  it("counts only guests who are coming", () => {
    expect(report.attending).toBe(3);
    expect(report.dietary).toEqual([{ name: "Bea", note: "Vegan" }]);
  });

  it("counts arrivals, departures and nights on site", () => {
    expect(report.arrivals).toMatchObject({ thu: 1, fri: 1, sat: 1, unset: 0 });
    expect(report.departures).toMatchObject({ sun: 1, mon: 1, unsure: 1 });
    // al: thu, fri, sat, sun nights; Bea: fri, sat; Cat unknown
    expect(report.nights).toEqual({ thu: 1, fri: 2, sat: 2, sun: 1, mon: 0 });
    expect(report.datesUnknown).toBe(1);
  });

  it("counts camping and vehicles, and lists performers", () => {
    expect(report.camping).toEqual({ camping: 1, not_camping: 0, undecided: 0, unset: 2 });
    expect(report.vehicles).toMatchObject({ car: 1, campervan: 1, unset: 1 });
    expect(report.performers).toEqual(["al"]);
  });

  it("lists glamping pod interest, maybes marked", () => {
    expect(report.glamping).toEqual([{ name: "Cat", maybe: true, contact: "cat@example.com" }]);
  });

  it("groups lifts by where from (as first typed), ignoring case and spaces, with no place last", () => {
    expect(report.lifts.map((group) => group.from)).toEqual(["bristol", "Anywhere"]);
    expect(report.lifts[0].offers).toEqual([{ name: "Bea", seats: 3, contact: "07700" }]);
    expect(report.lifts[0].needs.map((need) => need.name)).toEqual(["al"]);
  });

  it("makes an alphabetical check-in sheet", () => {
    expect(report.checkIn.map((row) => row.name)).toEqual(["al", "Bea", "Cat"]);
    expect(report.checkIn[0].payment).toBe("Not paid (not on the list)");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });

  it("stops a spreadsheet running an answer as a formula", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+44 7700")).toBe("'+44 7700");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@me")).toBe("'@me");
    expect(csvCell(-1)).toBe("-1");
  });

  it("writes a UTF-8 file with CRLF line ends", () => {
    expect(toCsv([["a", "b"], ["£1", null]])).toBe("﻿a,b\r\n£1,\r\n");
  });
});

describe("liftSummary", () => {
  it("describes offers and requests", () => {
    expect(liftSummary({ lift: null, lift_from: "x", lift_seats: 1 })).toBeNull();
    expect(liftSummary({ lift: "need", lift_from: "Leeds", lift_seats: null })).toBe("Would like a lift from Leeds");
    expect(liftSummary({ lift: "offer", lift_from: null, lift_seats: 1 })).toBe("Can offer a lift (1 spare seat)");
    expect(liftSummary({ lift: "offer", lift_from: "Bath", lift_seats: 2 })).toBe("Can offer a lift from Bath (2 spare seats)");
  });
});

describe("inviteMessage", () => {
  it("greets them by first name, with their link", () => {
    expect(inviteMessage("Sam Smith", "https://x/rsvp/t")).toBe(
      "Hi Sam! You're invited to Over the Hill, 13–15 August 2027 at Out to Grass. Here's your personal link to RSVP: https://x/rsvp/t",
    );
  });
});
