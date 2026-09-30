// The gate's check-in sheet as a PDF (A4, to print for when there's no
// signal): everyone coming, alphabetically, with a box to tick, their
// ticket reference, what they've paid and when they're arriving. Pure (no
// database), so it's unit-tested; served by /api/admin/checkin-sheet.pdf.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { DAY_LABELS } from "./answerLabels";
import type { CheckInRow } from "./report";

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points
const MARGIN = 40;
const ROW = 22;
const INK = rgb(0.1, 0.1, 0.09);
const SOFT = rgb(0.35, 0.34, 0.3);
const STRIPE = rgb(1, 0.957, 0.902); // the site's paper colour
const RULE = rgb(0.97, 0.81, 0.59); // its tan

// x of each column, and the widest its text may run
const COLUMNS = [
  { key: "box", x: MARGIN + 6, width: 14 },
  { key: "name", x: MARGIN + 30, width: 215, label: "Name" },
  { key: "ticket", x: MARGIN + 255, width: 70, label: "Ticket" },
  { key: "payment", x: MARGIN + 330, width: 105, label: "Payment" },
  { key: "arrival", x: MARGIN + 440, width: 75, label: "Arriving" },
] as const;

/** The standard PDF fonts only have Western European characters: keep
 * those, fall back to the letter without its accent, or "?" for the rest,
 * so an unusual name can never break the sheet. */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return [...text]
    .map((char) => {
      if (supported.has(char.codePointAt(0)!)) return char;
      const plain = char.normalize("NFKD").replace(/\p{M}/gu, "");
      return [...plain].every((c) => supported.has(c.codePointAt(0)!)) && plain ? plain : "?";
    })
    .join("");
}

/** Shortened with "…" to fit the column. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export async function checkInSheetPdf(rows: CheckInRow[], generatedAt: Date = new Date()): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Over the Hill: check-in sheet");
  pdf.setCreator("Over the Hill");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const printed = generatedAt.toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  });
  const here = rows.filter((row) => row.checkedIn).length;
  const perPage = Math.floor((PAGE.height - MARGIN * 2 - 90) / ROW);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - MARGIN;

    // heading (the full one on the first page)
    page.drawText("Over the Hill: check-in sheet", { x: MARGIN, y: y - 18, size: 18, font: bold, color: INK });
    y -= 34;
    const summary = `${rows.length} ${rows.length === 1 ? "guest" : "guests"} coming` +
      (here ? `, ${here} already checked in` : "") + `. Printed ${printed}.`;
    page.drawText(printable(summary, regular), { x: MARGIN, y: y - 10, size: 10, font: regular, color: SOFT });
    y -= 30;

    // column headings
    for (const column of COLUMNS) {
      if ("label" in column) page.drawText(column.label.toUpperCase(), { x: column.x, y: y - 10, size: 8, font: bold, color: SOFT });
    }
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 1.5, color: INK });

    const pageRows = rows.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
    pageRows.forEach((row, i) => {
      const top = y - i * ROW;
      if (i % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: top - ROW, width: PAGE.width - MARGIN * 2, height: ROW, color: STRIPE });
      }
      const baseline = top - ROW / 2 - 3.5;
      // the tick box (ticked if they're already in)
      page.drawRectangle({ x: COLUMNS[0].x, y: baseline - 1, width: 10, height: 10, borderColor: INK, borderWidth: 1 });
      if (row.checkedIn) page.drawText("X", { x: COLUMNS[0].x + 2, y: baseline + 0.5, size: 8, font: bold, color: INK });
      const cells: [number, string, PDFFont][] = [
        [1, row.name, bold],
        [2, row.ticketRef ?? "-", regular],
        [3, row.payment, regular],
        [4, row.arrival ? (DAY_LABELS[row.arrival] ?? row.arrival).replace(/ August$/, "") : "-", regular],
      ];
      for (const [index, text, font] of cells) {
        const column = COLUMNS[index];
        page.drawText(fit(printable(text, font), font, 10, column.width), { x: column.x, y: baseline, size: 10, font, color: INK });
      }
      page.drawLine({
        start: { x: MARGIN, y: top - ROW }, end: { x: PAGE.width - MARGIN, y: top - ROW }, thickness: 0.5, color: RULE,
      });
    });

    if (rows.length === 0) {
      page.drawText("Nobody's said yes yet.", { x: MARGIN, y: y - 20, size: 11, font: regular, color: SOFT });
    }

    const footer = `Page ${pageIndex + 1} of ${pageCount}`;
    page.drawText(footer, {
      x: PAGE.width - MARGIN - regular.widthOfTextAtSize(footer, 9), y: MARGIN - 16, size: 9, font: regular, color: SOFT,
    });
  }

  return pdf.save();
}
