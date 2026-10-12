import type { APIRoute } from "astro";
import { RESEND_API_KEY } from "astro:env/server";
import { flushEmailQueue } from "../../../../lib/emailQueue";

export const prerender = false;

// "Try sending now" on admin Emails: the same as the hourly run.
export const POST: APIRoute = async ({ redirect }) => {
  const { sent, left, stoppedBy } = await flushEmailQueue(RESEND_API_KEY);
  const params = new URLSearchParams({ flushed: String(sent), left: String(left), ...(stoppedBy ? { stopped: stoppedBy } : {}) });
  return redirect(`/admin/emails?${params}`, 303);
};
