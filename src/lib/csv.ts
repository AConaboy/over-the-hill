// CSV for the hosts' export (opened in Excel, Numbers or Google Sheets).

/** One cell: quoted when it needs to be, and with a leading ' on anything a
 * spreadsheet would otherwise run as a formula (a guest's answer starting
 * "=", "+", "-", "@", or a tab or carriage return). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows to a CSV file: CRLF line ends, as spreadsheets expect, and a BOM
 * so Excel reads it as UTF-8 (names with accents, the £ sign). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
