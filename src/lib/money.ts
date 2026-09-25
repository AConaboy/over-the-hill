// All amounts are GBP stored as integer pence (see the spec's data model).

/** 1250 → "£12.50", 2500 → "£25", 0 → "£0". */
export function formatPence(pence: number, { symbol = true } = {}): string {
  const pounds = Math.floor(pence / 100);
  const remainder = pence % 100;
  const amount = remainder === 0 ? String(pounds) : `${pounds}.${String(remainder).padStart(2, "0")}`;
  return symbol ? `£${amount}` : amount;
}
