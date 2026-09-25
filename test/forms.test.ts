import { describe, expect, it } from "vitest";
import { choiceField, inviterNamesField, LONG_TEXT_MAX, SHORT_TEXT_MAX, textField } from "../src/lib/forms";

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
