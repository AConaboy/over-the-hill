import { describe, expect, it } from "vitest";
import { deadlineHeading, findBlock, inlineParts, parseBody, type ContentBlock } from "../src/lib/content";

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

  it("makes a subheading of a paragraph that's a single \"### \" line", () => {
    expect(parseBody("### Friday\n\nArrival day!\n\n### Two\nlines")).toEqual([
      { type: "h3", text: "Friday" },
      { type: "p", text: "Arrival day!" },
      { type: "p", text: "### Two lines" },
    ]);
  });
});

describe("inlineParts", () => {
  it("finds [text](link) links to this site or to http(s) addresses", () => {
    expect(inlineParts("See for yourself [here](/location). Or [Pitchup](https://pitchup.com/x).")).toEqual([
      { text: "See for yourself " },
      { text: "here", href: "/location" },
      { text: ". Or " },
      { text: "Pitchup", href: "https://pitchup.com/x" },
      { text: "." },
    ]);
  });

  it("highlights **text**", () => {
    expect(inlineParts("Join us at **Over the Hill** from **13–15 August**!")).toEqual([
      { text: "Join us at " },
      { text: "Over the Hill", highlight: true },
      { text: " from " },
      { text: "13–15 August", highlight: true },
      { text: "!" },
    ]);
    expect(inlineParts("a lone ** or *one* stays")).toEqual([{ text: "a lone ** or *one* stays" }]);
  });

  it("leaves anything else as typed", () => {
    expect(inlineParts("[bad](javascript:alert(1)) and [rel](location) and plain")).toEqual([
      { text: "[bad](javascript:alert(1)) and [rel](location) and plain" },
    ]);
    expect(inlineParts("")).toEqual([]);
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
