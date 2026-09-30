import type { APIRoute } from "astro";
import { deleteContentBlock } from "../../../../../../lib/content";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id;
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");

  if (id) {
    await deleteContentBlock(id);
  }

  return redirect(slug ? `/admin/content/${slug}` : "/admin/content", 303);
};
