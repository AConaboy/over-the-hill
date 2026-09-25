import { describe, expect, it } from "vitest";
import { formatPence } from "../src/lib/money";

describe("formatPence", () => {
  it("drops .00 and pads single-digit pence", () => {
    expect(formatPence(2500)).toBe("£25");
    expect(formatPence(1250)).toBe("£12.50");
    expect(formatPence(1205)).toBe("£12.05");
    expect(formatPence(0)).toBe("£0");
  });

  it("can omit the symbol for form inputs", () => {
    expect(formatPence(1250, { symbol: false })).toBe("12.50");
  });
});
