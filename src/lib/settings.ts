import { getDb } from "./db";
import { refreshPaymentStatusStatement } from "./guests";
import type { PaymentSettings } from "./payments";

// Host-editable payment settings (admin Payments page), stored as key/value
// rows (migrations/0008_payments.sql). Each environment has its own
// database, so staging and production keep separate settings.

type SettingKey = "deposit_pence" | "standard_price_pence" | "deposits_open" | "balance_open";

function nowIso(): string {
  return new Date().toISOString();
}

function toPence(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const pence = Number(value);
  return Number.isInteger(pence) && pence >= 0 ? pence : null;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const db = getDb();
  const { results } = await db.prepare("select key, value from settings").all<{ key: SettingKey; value: string }>();
  const values = new Map(results.map((row) => [row.key, row.value]));

  return {
    depositPence: toPence(values.get("deposit_pence")),
    standardPricePence: toPence(values.get("standard_price_pence")),
    depositsOpen: values.get("deposits_open") === "1",
    balanceOpen: values.get("balance_open") === "1",
  };
}

/** Saves all four settings and recomputes every guest's payment_status in
 * the same batch, since a new standard price can move guests between
 * "deposit paid" and "paid in full". An amount of null deletes its row
 * rather than storing a blank, which the SQL price lookup relies on. */
export async function savePaymentSettings(settings: PaymentSettings): Promise<void> {
  const db = getDb();
  const timestamp = nowIso();

  const upsert = (key: SettingKey, value: string) =>
    db
      .prepare(
        `insert into settings (key, value, updated_at) values (?, ?, ?)
         on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, value, timestamp);

  const setAmount = (key: SettingKey, pence: number | null) =>
    pence === null ? db.prepare("delete from settings where key = ?").bind(key) : upsert(key, String(pence));

  await db.batch([
    setAmount("deposit_pence", settings.depositPence),
    setAmount("standard_price_pence", settings.standardPricePence),
    upsert("deposits_open", settings.depositsOpen ? "1" : "0"),
    upsert("balance_open", settings.balanceOpen ? "1" : "0"),
    refreshPaymentStatusStatement(db),
  ]);
}

/** Why these settings can't be saved as they are, or null if they can.
 * `stripeConfigured` is false when this environment has no Stripe keys. */
export function paymentSettingsProblem(settings: PaymentSettings, stripeConfigured: boolean): string | null {
  const { depositPence, standardPricePence, depositsOpen, balanceOpen } = settings;
  if ((depositsOpen || balanceOpen) && !stripeConfigured) {
    return "Payments can't be opened until Stripe is set up for this site.";
  }
  if (depositsOpen && !depositPence) return "Set a deposit amount before opening deposits.";
  if (balanceOpen && standardPricePence === null) return "Set the ticket price before opening balance payments.";
  if (depositPence !== null && standardPricePence !== null && depositPence > standardPricePence) {
    return "The deposit can't be more than the ticket price.";
  }
  return null;
}
