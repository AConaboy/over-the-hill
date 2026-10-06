import { describe, expect, it } from "vitest";
import { festivalCalendar } from "../src/lib/calendar";

describe("festivalCalendar", () => {
  const ics = festivalCalendar("https://overthehill.live/rsvp/abc", "festival-2027-g1", new Date("2027-05-01T12:00:00.000Z"));
  const lines = ics.split("\r\n");

  it("is an all-day event from 13 to 15 August 2027", () => {
    expect(lines).toContain("DTSTART;VALUE=DATE:20270813");
    expect(lines).toContain("DTEND;VALUE=DATE:20270816");
    expect(lines).toContain("DTSTAMP:20270501T120000Z");
    expect(lines).toContain("UID:festival-2027-g1@overthehill.live");
  });

  it("escapes commas in the location", () => {
    expect(lines).toContain("LOCATION:Out to Grass\\, Woodend Farm\\, Cradley\\, WR13 5JW");
  });

  it("folds long lines to 75 octets, with CRLF endings", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:Your RSVP\\, tickets and updates: https://overthehill.live/rsvp/abc");
  });
});
