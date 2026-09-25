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
