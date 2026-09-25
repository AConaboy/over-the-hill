// Shared parsing for form posts. Everything is trimmed and length-capped,
// and choice fields only accept their known values, so a hand-crafted
// request can't store arbitrarily large text or trip a database CHECK
// constraint (which would surface as a 500).

export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;

/** Trimmed text capped at maxLength, or null when blank/missing. */
export function textField(form: FormData, name: string, maxLength = SHORT_TEXT_MAX): string | null {
  const value = form.get(name);
  const str = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return str.length > 0 ? str : null;
}

/** One of the allowed values, or null for anything else (including blank). */
export function choiceField<T extends string>(form: FormData, name: string, allowed: readonly T[]): T | null {
  const value = form.get(name);
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** "Andrew, Alice" → ["Andrew", "Alice"]. De-duplication happens in
 * src/lib/guests.ts, where the database constraint lives. */
export function inviterNamesField(form: FormData, name: string): string[] {
  const value = form.get(name);
  const str = typeof value === "string" ? value : "";
  return str
    .split(",")
    .map((inviter) => inviter.trim().slice(0, SHORT_TEXT_MAX))
    .filter(Boolean);
}

/** A ticked checkbox posts "on"; an unticked one posts nothing. */
export function checkboxField(form: FormData, name: string): boolean {
  return form.get(name) === "on";
}

const POUNDS_PATTERN = /^£?(\d{1,5})(?:\.(\d{1,2}))?$/;

/** "12", "12.5", "£12.50" → pence. Blank → null. Anything else (negative,
 * 3+ decimal places, over £99,999, text) → "invalid", so the caller can
 * refuse to save rather than silently dropping a price. Parsed from the
 * string rather than via floats, so "0.29" can't come out as 28p. */
export function penceField(form: FormData, name: string): number | null | "invalid" {
  const value = form.get(name);
  const str = typeof value === "string" ? value.trim().replace(/,/g, "") : "";
  if (!str) return null;
  const match = str.match(POUNDS_PATTERN);
  if (!match) return "invalid";
  const [, pounds, pence = ""] = match;
  return Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
}

/** The admin-only performer fields shared by the add and edit guest forms,
 * or null if the price didn't parse. */
export function performerFields(form: FormData): { isPerformer: boolean; amountDuePence: number | null } | null {
  const amountDuePence = penceField(form, "ticketPrice");
  if (amountDuePence === "invalid") return null;
  return { isPerformer: checkboxField(form, "isPerformer"), amountDuePence };
}
