import { getDb } from "./db";
import { setContentFields } from "./content";
import { EMAIL_IDS, emailTemplate, type EmailField, type EmailId, type EmailTexts } from "./emailContent";

// Hosts' own wording for the emails (admin Emails), kept with the site text
// in content_fields under the page "email:<id>", one row per field changed.
// Anything not saved uses the default in src/lib/emailContent.ts.

const PREFIX = "email:";

export function isEmailId(value: string | undefined): value is EmailId {
  return value !== undefined && (EMAIL_IDS as readonly string[]).includes(value);
}

export async function getEmailTexts(): Promise<EmailTexts> {
  const { results } = await getDb()
    .prepare("select page_slug, field_key, value from content_fields where page_slug like 'email:%'")
    .all<{ page_slug: string; field_key: string; value: string }>();
  const texts: EmailTexts = {};
  for (const row of results) {
    const id = row.page_slug.slice(PREFIX.length);
    if (!isEmailId(id)) continue;
    (texts[id] ??= {})[row.field_key as EmailField] = row.value;
  }
  return texts;
}

/** The email's fields from an admin form (field[subject] etc.), keeping
 * only the fields that email has. */
export function emailFieldsFromForm(id: EmailId, form: FormData): Partial<Record<EmailField, string>> {
  const template = emailTemplate(id)!;
  const values: Partial<Record<EmailField, string>> = {};
  for (const field of Object.keys(template.fields) as EmailField[]) {
    const value = form.get(`field[${field}]`);
    if (typeof value === "string") values[field] = value.replace(/\r\n/g, "\n").slice(0, 5000);
  }
  return values;
}

export async function saveEmailText(id: EmailId, values: Partial<Record<EmailField, string>>): Promise<void> {
  await setContentFields(`${PREFIX}${id}`, values as Record<string, string>);
}

/** Back to the default wording. */
export async function resetEmailText(id: EmailId): Promise<void> {
  await getDb().prepare("delete from content_fields where page_slug = ?").bind(`${PREFIX}${id}`).run();
}
