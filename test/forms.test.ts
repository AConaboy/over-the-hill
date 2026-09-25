import { describe, expect, it } from "vitest";
import {
  checkboxField,
  choiceField,
  inviterNamesField,
  LONG_TEXT_MAX,
  penceField,
  performerFields,
  SHORT_TEXT_MAX,
  textField,
} from "../src/lib/forms";

function formWith(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

describe("textField", () => {
  it("trims and returns null for blank or missing values", () => {
    const form = formWith({ name: "  Ada  ", blank: "   " });
    expect(textField(form, "name")).toBe("Ada");
    expect(textField(form, "blank")).toBeNull();
    expect(textField(form, "missing")).toBeNull();
  });

  it("caps length", () => {
    const form = formWith({ short: "x".repeat(500), long: "y".repeat(5000) });
    expect(textField(form, "short")).toHaveLength(SHORT_TEXT_MAX);
    expect(textField(form, "long", LONG_TEXT_MAX)).toHaveLength(LONG_TEXT_MAX);
  });
});

describe("choiceField", () => {
  const options = ["camping", "not_camping"] as const;

  it("accepts only the allowed values", () => {
    expect(choiceField(formWith({ camping: "camping" }), "camping", options)).toBe("camping");
    expect(choiceField(formWith({ camping: "glamping" }), "camping", options)).toBeNull();
    expect(choiceField(formWith({}), "camping", options)).toBeNull();
  });
});

describe("inviterNamesField", () => {
  it("splits on commas and drops blanks", () => {
    expect(inviterNamesField(formWith({ inviters: "Andrew, Alice ,, " }), "inviters")).toEqual([
      "Andrew",
      "Alice",
    ]);
  });
});

describe("penceField", () => {
  const pence = (value: string) => penceField(formWith({ price: value }), "price");

  it("converts pounds to pence without float rounding", () => {
    expect(pence("25")).toBe(2500);
    expect(pence("12.5")).toBe(1250);
    expect(pence("£12.50")).toBe(1250);
    expect(pence("0.29")).toBe(29);
    expect(pence("1,000")).toBe(100000);
    expect(pence("0")).toBe(0);
  });

  it("treats blank as null", () => {
    expect(pence("  ")).toBeNull();
    expect(penceField(formWith({}), "price")).toBeNull();
  });

  it("rejects anything else", () => {
    expect(pence("-5")).toBe("invalid");
    expect(pence("12.505")).toBe("invalid");
    expect(pence("100000")).toBe("invalid");
    expect(pence("free")).toBe("invalid");
  });
});

describe("performerFields", () => {
  it("reads the checkbox and price", () => {
    expect(performerFields(formWith({ isPerformer: "on", ticketPrice: "0" }))).toEqual({
      isPerformer: true,
      amountDuePence: 0,
    });
    expect(checkboxField(formWith({}), "isPerformer")).toBe(false);
  });

  it("returns null for an invalid price", () => {
    expect(performerFields(formWith({ isPerformer: "on", ticketPrice: "lots" }))).toBeNull();
  });
});
