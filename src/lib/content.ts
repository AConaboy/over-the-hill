import { getDb } from "./db";

export type ContentVariant = "block" | "notice";

export interface ContentBlock {
  id: string;
  page_slug: string;
  sort_order: number;
  variant: ContentVariant;
  eyebrow: string | null;
  heading: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface PageContent {
  fields: Record<string, string>;
  blocks: ContentBlock[];
}

export interface ContentFieldKey {
  key: string;
  label: string;
  multiline?: boolean;
}

export interface ContentPageDef {
  slug: string;
  label: string;
  // Cosmetic only, for the admin page list — whether this page currently
  // has a routed file in src/pages/ (vs. parked in src/pages-disabled/).
  // Content stays editable either way.
  routed: boolean;
  fieldKeys: ContentFieldKey[];
}

// The only place page slugs/labels/expected field keys are defined. Adding a
// field here doesn't create it in the DB — getPageContent() just returns ""
// for a key with no row yet, and saving from the admin form creates it.
export const CONTENT_PAGES: ContentPageDef[] = [
  {
    slug: "index",
    label: "Splash / Home",
    routed: true,
    fieldKeys: [
      { key: "tagline", label: "Tagline" },
      { key: "venue_line", label: "Venue & address line" },
      { key: "cta_label", label: "RSVP button label" },
      { key: "credits", label: "Brought to you by (one name per line)", multiline: true },
    ],
  },
  {
    slug: "rsvp",
    label: "RSVP (no link found)",
    routed: true,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "rsvp-form",
    label: "RSVP form (surrounding text)",
    routed: true,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "about",
    label: "About",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "activities",
    label: "Activities",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "camping",
    label: "Camping",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "food",
    label: "Food",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "travel",
    label: "Travel",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "faq",
    label: "FAQs",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  {
    slug: "line-up",
    label: "Line-up",
    routed: false,
    fieldKeys: [
      { key: "hero_eyebrow", label: "Eyebrow" },
      { key: "hero_heading", label: "Heading" },
      { key: "hero_introduction", label: "Introduction", multiline: true },
    ],
  },
  // birthday-game.astro is deliberately excluded: it's interactive game
  // logic with paired host/photo/birthday data, not prose, and forcing it
  // into free-text fields would risk breaking the game.
];

export function getContentPageDef(slug: string): ContentPageDef | undefined {
  return CONTENT_PAGES.find((page) => page.slug === slug);
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getPageContent(slug: string): Promise<PageContent> {
  const db = getDb();

  const [{ results: fieldRows }, { results: blockRows }] = await Promise.all([
    db.prepare("select field_key, value from content_fields where page_slug = ?").bind(slug).all<{
      field_key: string;
      value: string;
    }>(),
    db
      .prepare("select * from content_blocks where page_slug = ? order by sort_order")
      .bind(slug)
      .all<ContentBlock>(),
  ]);

  const fields: Record<string, string> = {};
  for (const row of fieldRows) {
    fields[row.field_key] = row.value;
  }

  return { fields, blocks: blockRows };
}

export async function setContentFields(slug: string, values: Record<string, string>): Promise<void> {
  const db = getDb();
  const timestamp = nowIso();
  const entries = Object.entries(values);
  if (entries.length === 0) return;

  await db.batch(
    entries.map(([key, value]) =>
      db
        .prepare(
          `insert into content_fields (page_slug, field_key, value, updated_at)
           values (?, ?, ?, ?)
           on conflict(page_slug, field_key) do update set value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(slug, key, value, timestamp),
    ),
  );
}

export interface ContentBlockUpdate {
  id: string;
  variant: ContentVariant;
  eyebrow: string | null;
  heading: string | null;
  body: string;
}

export async function updateContentBlocks(updates: ContentBlockUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const db = getDb();
  const timestamp = nowIso();

  await db.batch(
    updates.map((update) =>
      db
        .prepare(
          "update content_blocks set variant = ?, eyebrow = ?, heading = ?, body = ?, updated_at = ? where id = ?",
        )
        .bind(update.variant, update.eyebrow, update.heading, update.body, timestamp, update.id),
    ),
  );
}

export async function deleteContentBlock(id: string): Promise<void> {
  const db = getDb();
  await db.prepare("delete from content_blocks where id = ?").bind(id).run();
}

export async function getContentBlockPageSlug(id: string): Promise<string | null> {
  const db = getDb();
  const row = await db.prepare("select page_slug from content_blocks where id = ?").bind(id).first<{
    page_slug: string;
  }>();
  return row?.page_slug ?? null;
}

// --- Rendering ---

export interface ParsedNode {
  type: "p" | "ul";
  text?: string;
  items?: string[];
}

/** Deliberately not markdown — a non-technical editor shouldn't need to
 * learn any syntax. Two rules only: a blank line starts a new paragraph,
 * and a run of lines each starting with "- " becomes a bullet list. */
export function parseBody(raw: string): ParsedNode[] {
  return raw
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
        return { type: "ul" as const, items: lines.map((line) => line.slice(2).trim()) };
      }
      return { type: "p" as const, text: lines.join(" ") };
    });
}
