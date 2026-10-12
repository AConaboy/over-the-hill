// The festival as an iCalendar file, for "Add to calendar". Pure, so it's
// unit-tested; served by src/pages/rsvp/[token]/calendar.ics.ts.

/** Text for an iCalendar property: \ ; , and new lines escaped. */
function icsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines over 75 octets are folded onto continuation lines (RFC 5545). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + charSize > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Over the Hill, all day Friday 13 to Sunday 15 August 2027 (DTEND is the
 * day after, as all-day events need). `pageUrl` is the guest's own page. */
export function festivalCalendar(pageUrl: string, uid: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Over the Hill//Invite//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@overthehill.live`,
    `DTSTAMP:${stamp}`,
    "DTSTART;VALUE=DATE:20270813",
    "DTEND;VALUE=DATE:20270816",
    `SUMMARY:${icsText("Over the Hill")}`,
    `LOCATION:${icsText("Out to Grass, Woodend Farm, Cradley, WR13 5JW")}`,
    `DESCRIPTION:${icsText(`Your RSVP, tickets and updates: ${pageUrl}`)}`,
    `URL:${pageUrl}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n") + "\r\n";
}
