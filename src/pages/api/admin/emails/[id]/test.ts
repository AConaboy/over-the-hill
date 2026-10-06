import type { APIRoute } from "astro";
import { sendTestEmail } from "../../../../../lib/email";
import { isEmailId } from "../../../../../lib/emailTexts";

export const prerender = false;

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Send a test" on admin Emails: this email to the address a host typed. */
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  if (!isEmailId(id)) return redirect("/admin/emails", 303);
  const back = `/admin/emails/${id}`;
  const to = String((await request.formData()).get("to") ?? "").trim();
  if (!ADDRESS.test(to) || to.length > 254) return redirect(`${back}?testerror=address#test`, 303);
  try {
    await sendTestEmail(to, id);
  } catch (err) {
    console.error("Failed to send test email", err);
    return redirect(`${back}?testerror=send#test`, 303);
  }
  return redirect(`${back}?sent=${encodeURIComponent(to)}#test`, 303);
};
