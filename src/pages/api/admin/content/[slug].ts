import type { APIRoute } from "astro";
import {
  getContentPageDef,
  setContentFields,
  updateContentBlocks,
  type ContentBlockUpdate,
  type ContentVariant,
} from "../../../../lib/content";

export const prerender = false;

function emptyToNull(value: FormDataEntryValue | null | undefined): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str : null;
}

/** Parses the form's bracket-notation field names — field[key] and
 * block[id][subkey] — into structured updates. */
function parseForm(form: FormData): {
  fieldValues: Record<string, string>;
  blockUpdates: Map<string, Partial<ContentBlockUpdate>>;
} {
  const fieldValues: Record<string, string> = {};
  const blockUpdates = new Map<string, Partial<ContentBlockUpdate>>();

  const fieldPattern = /^field\[(.+)\]$/;
  const blockPattern = /^block\[(.+)\]\[(variant|eyebrow|heading|body)\]$/;

  for (const [name, value] of form.entries()) {
    if (typeof value !== "string") continue;

    const fieldMatch = name.match(fieldPattern);
    if (fieldMatch) {
      fieldValues[fieldMatch[1]] = value;
      continue;
    }

    const blockMatch = name.match(blockPattern);
    if (blockMatch) {
      const [, id, subkey] = blockMatch;
      const update = blockUpdates.get(id) ?? { id };
      if (subkey === "variant") {
        update.variant = (value === "notice" ? "notice" : "block") as ContentVariant;
      } else if (subkey === "eyebrow") {
        update.eyebrow = emptyToNull(value);
      } else if (subkey === "heading") {
        update.heading = emptyToNull(value);
      } else if (subkey === "body") {
        update.body = value;
      }
      blockUpdates.set(id, update);
    }
  }

  return { fieldValues, blockUpdates };
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const slug = params.slug;
  const pageDef = slug ? getContentPageDef(slug) : undefined;
  if (!pageDef) {
    return redirect("/admin/content", 303);
  }

  const form = await request.formData();
  const { fieldValues, blockUpdates } = parseForm(form);

  await setContentFields(pageDef.slug, fieldValues);

  const completeUpdates: ContentBlockUpdate[] = [];
  for (const update of blockUpdates.values()) {
    if (!update.id) continue;
    completeUpdates.push({
      id: update.id,
      variant: update.variant ?? "block",
      eyebrow: update.eyebrow ?? null,
      heading: update.heading ?? null,
      body: update.body ?? "",
    });
  }
  await updateContentBlocks(completeUpdates);

  return redirect(`/admin/content/${pageDef.slug}`, 303);
};
