import type { APIRoute } from "astro";
import { getContentPageDef, addContentBlock } from "../../../../../lib/content";

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const slug = params.slug;
  const pageDef = slug ? getContentPageDef(slug) : undefined;
  if (!pageDef) {
    return redirect("/admin/content", 303);
  }

  await addContentBlock(pageDef.slug, "block");

  return redirect(`/admin/content/${pageDef.slug}`, 303);
};
