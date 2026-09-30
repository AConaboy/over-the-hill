import { describe, expect, it } from "vitest";
import { findBlock, parseBody, type ContentBlock } from "../src/lib/content";

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
