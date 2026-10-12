import { describe, expect, it } from "vitest";
import {
  duplicateKey,
  heldBackNames,
  mergeCandidates,
  parseCsv,
  planImport,
  roundToPhase,
  skippedKey,
  suggestName,
} from "../src/lib/inviteImport";

describe("mergeCandidates", () => {
  it("keeps every host and the earlier phase", () => {
    expect(
      mergeCandidates("Sam Tully", [
        { name: "Sam Tully", group: 2, inviters: ["Host B"], performer: false },
        { name: "Sam Tulley", group: 1, inviters: ["Host C", "Host B"], performer: false },
      ]),
    ).toEqual({ name: "Sam Tully", phase: "1", inviters: ["Host B", "Host C"], performer: false });
  });

  it("keeps an act an act", () => {
    expect(
      mergeCandidates("A Band", [
        { name: "A Band", group: 1, inviters: [], performer: false },
        { name: "A Bnad", group: "acts", inviters: ["Bryony"], performer: true },
      ]).phase,
    ).toBe("acts");
  });
});

describe("suggestName", () => {
  it("drops question marks and notes in brackets", () => {
    expect(suggestName("Rowan", "Smith?")).toEqual({ first: "Rowan", surname: "Smith" });
    expect(suggestName("Iris", "(Tom)")).toEqual({ first: "Iris", surname: "" });
    expect(suggestName("Kit", "Lane (The Band)")).toEqual({ first: "Kit", surname: "Lane" });
    expect(suggestName("Wren?", "?")).toEqual({ first: "Wren", surname: "" });
    expect(suggestName("Ollie +1", "?")).toEqual({ first: "Ollie", surname: "" });
  });
});

const SHEET = [
  "Communal,,,Host A,,,Host B,,,,Unlikely",
  "Round,First Name,Surname,Round,First Name,Surname,Round,First Name,Surname,,Host A",
  "1,Ada,Hart,1.0,Robyn,Fairweather,2,robyn,fairweather,,Ada Hart",
  "1,Nell,?,2,Iris,(Tom),0,Otis,Marsh,,",
  '1,Rowan,Smith?,3,"Mae, ",Quill,1,Mae,Quill,,',
  ",,,,,,6 (Band),,,,",
  "1,Robin,Fairweather,,,,0,Ned,Bell (The Band),,",
].join("\r\n");

describe("planImport", () => {
  const plan = planImport(SHEET);
  const byName = Object.fromEntries(plan.guests.map((g) => [g.name, g]));

  it("merges people listed by several hosts, in the earliest round", () => {
    expect(byName["Robyn Fairweather"]).toEqual({ name: "Robyn Fairweather", group: 1, inviters: ["Host A", "Host B"], performer: false });
    expect(byName["Mae Quill"].group).toBe(1);
  });

  it("gives Communal guests no inviter and ignores the Unlikely block", () => {
    expect(byName["Ada Hart"].inviters).toEqual([]);
    expect(plan.guests.filter((g) => g.name === "Ada Hart")).toHaveLength(1);
  });

  it("imports round 0 as performers in their own group", () => {
    expect(byName["Otis Marsh"]).toMatchObject({ group: "acts", performer: true, inviters: ["Host B"] });
  });

  it("skips and reports unknown or unsure surnames", () => {
    expect(plan.skipped.map((s) => `${s.first} ${s.surname}`)).toEqual(["Nell ?", "Iris (Tom)", "Rowan Smith?", "Ned Bell (The Band)"]);
  });

  it("flags near-identical names", () => {
    expect(plan.possibleDuplicates.map(([a, b]) => [a.name, b.name])).toContainEqual(["Robin Fairweather", "Robyn Fairweather"]);
    expect(heldBackNames(plan)).toEqual(new Set(["Robin Fairweather", "Robyn Fairweather"]));
  });

  it("keys rows and pairs the same way across uploads", () => {
    const [a, b] = plan.possibleDuplicates[0];
    expect(duplicateKey(a, b)).toBe(duplicateKey(b, a));
    expect(skippedKey(plan.skipped[0])).toBe("skipped|communal|1|nell|?");
    expect(skippedKey({ ...plan.skipped[0], round: "1.0" })).toBe(skippedKey(plan.skipped[0]));
  });
});

describe("parseCsv", () => {
  it("handles quotes and CRLF", () => {
    expect(parseCsv('a,"b ""c"", d"\r\n1,2')).toEqual([["a", 'b "c", d'], ["1", "2"]]);
  });
});

describe("roundToPhase", () => {
  it("reads the sheet's rounds", () => {
    expect(["1", "2.0", "3", "0", "6 (Band)", ""].map(roundToPhase)).toEqual(["1", "2", "3", "acts", null, null]);
  });
});
