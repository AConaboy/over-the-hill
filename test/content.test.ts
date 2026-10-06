import { describe, expect, it } from "vitest";
import { deadlineHeading, findBlock, parseBody, type ContentBlock } from "../src/lib/content";

describe("parseBody", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseBody("First line\ncontinues\n\nSecond")).toEqual([
      { type: "p", text: "First line continues" },
      { type: "p", text: "Second" },
    ]);
  });

  it("turns a run of '- ' lines into a list", () => {
    expect(parseBody("Intro\n\n- one\n- two")).toEqual([
      { type: "p", text: "Intro" },
      { type: "ul", items: ["one", "two"] },
    ]);
  });

  it("keeps mixed lines as a paragraph", () => {
    expect(parseBody("- one\nnot a bullet")).toEqual([{ type: "p", text: "- one not a bullet" }]);
  });
});

describe("findBlock", () => {
  it("finds by id regardless of position", () => {
    const blocks = [{ id: "b" }, { id: "a" }] as ContentBlock[];
    expect(findBlock(blocks, "a")).toBe(blocks[1]);
    expect(findBlock(blocks, "missing")).toBeUndefined();
  });
});

describe("deadlineHeading", () => {
  it("fills {date} with the day the link expires, in UK time", () => {
    expect(deadlineHeading("Please RSVP by {date}", "2026-11-05T23:30:00.000Z")).toBe("Please RSVP by 5 November 2026");
    // 00:30 on the 6th in London (BST ended, so GMT) is still the 6th
    expect(deadlineHeading("Please RSVP by {date}", "2026-11-06T00:30:00.000Z")).toBe("Please RSVP by 6 November 2026");
    expect(deadlineHeading("Please RSVP by {date}", "2026-10-20T23:30:00.000Z")).toBe("Please RSVP by 21 October 2026");
  });

  it("drops the date when there's none, and leaves other headings alone", () => {
    expect(deadlineHeading("Please RSVP by {date}", null)).toBe("Please RSVP");
    expect(deadlineHeading("Reply by 1 May", "2026-11-05T12:00:00.000Z")).toBe("Reply by 1 May");
    expect(deadlineHeading(null, "2026-11-05T12:00:00.000Z")).toBeNull();
  });
});
