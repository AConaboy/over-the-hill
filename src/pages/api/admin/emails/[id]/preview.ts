import type { APIRoute } from "astro";
import { SITE_URL } from "astro:env/server";
import { sampleEmail, type EmailTexts } from "../../../../../lib/emailContent";
import { emailFieldsFromForm, getEmailTexts, isEmailId } from "../../../../../lib/emailTexts";
import { getPaymentSettings } from "../../../../../lib/settings";

export const prerender = false;

// One email as a guest would see it, for admin Emails' preview frame (it
// gets its own looser security headers in src/middleware.ts, as an email
// carries its own styles). GET: the saved wording. POST: the edit form's
// wording as it stands, unsaved ("Preview changes").
async function preview(id: string | undefined, form: FormData | null, origin: string): Promise<Response> {
  if (!isEmailId(id)) return new Response("Not found", { status: 404 });
  const texts: EmailTexts = await getEmailTexts();
  if (form) texts[id] = { ...texts[id], ...emailFieldsFromForm(id, form) };
  const settings = await getPaymentSettings();
  // pictures from the site the preview's shown on, so they load before the
  // live site has them (and on staging, behind its sign-in)
  const email = sampleEmail(id, SITE_URL, texts, { depositPence: settings.depositPence, pricePence: settings.standardPricePence }, origin);
  return new Response(email.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const GET: APIRoute = ({ params, url }) => preview(params.id, null, url.origin);
export const POST: APIRoute = async ({ params, request, url }) => preview(params.id, await request.formData(), url.origin);
