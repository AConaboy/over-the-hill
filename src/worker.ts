import { handle } from "@astrojs/cloudflare/handler";
import { flushEmailQueue } from "./lib/emailQueue";

// The Worker's entry (wrangler.jsonc "main"): Astro answers every request as
// before, and the hourly cron trigger sends any emails waiting in the queue
// (Resend's daily limit, or an outage; see src/lib/emailQueue.ts).
export default {
  fetch: handle,
  async scheduled(_controller, env, ctx) {
    // The Resend key straight from the Worker's env: astro:env is only set
    // up for requests.
    const apiKey = (env as Env & { RESEND_API_KEY?: string }).RESEND_API_KEY;
    ctx.waitUntil(
      flushEmailQueue(apiKey).then(
        ({ sent, left, stoppedBy }) => {
          if (sent || left) console.log(`Email queue: sent ${sent}, ${left} waiting${stoppedBy ? ` (stopped: ${stoppedBy})` : ""}`);
        },
        (err) => console.error("Email queue run failed", err),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
