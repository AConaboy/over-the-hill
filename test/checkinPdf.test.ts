import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkInSheetPdf } from "../src/lib/checkinPdf";
import type { CheckInRow } from "../src/lib/report";

const row = (name: string, extra: Partial<CheckInRow> = {}): CheckInRow => ({
  name, ticketRef: "AB12CD34", payment: "Paid", arrival: "fri", checkedIn: false, ...extra,
});

describe("checkInSheetPdf", () => {
  it("makes a PDF, one A4 page for a short list", async () => {
    const bytes = await checkInSheetPdf([row("Ada Lovelace"), row("Zoë Ó Briain", { checkedIn: true })]);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Over the Hill: check-in sheet");
  });

  it("runs onto more pages for a long list", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row(`Guest ${String(i).padStart(3, "0")}`));
    expect((await PDFDocument.load(await checkInSheetPdf(rows))).getPageCount()).toBe(4);
  });

  it("copes with names the standard fonts can't draw, and an empty list", async () => {
    await expect(checkInSheetPdf([row("王小明 Wang"), row("Łukasz Żółć"), row("Emoji 🎉 Person")])).resolves.toBeInstanceOf(Uint8Array);
    expect((await PDFDocument.load(await checkInSheetPdf([]))).getPageCount()).toBe(1);
  });
});
