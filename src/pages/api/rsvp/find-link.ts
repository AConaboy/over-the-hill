import type { APIRoute } from "astro";
import { getGuestsByEmail, canSendMagicLink, markMagicLinkSent } from "../../../lib/guests";
import { sendMagicLinkEmail } from "../../../lib/email";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();

  if (email) {
    const matches = await getGuestsByEmail(email);

    for (const guest of matches) {
      if (!canSendMagicLink(guest)) continue;

      // Non-blocking, same as the RSVP confirmation email: a failed send
      // here must never change what the visitor sees.
      try {
        await sendMagicLinkEmail(guest);
        await markMagicLinkSent(guest.id);
      } catch (err) {
        console.error("Failed to send magic link email", err);
      }
    }
  }

  // Always the same redirect regardless of whether we found a match, sent
  // anything, or hit the cooldown — the response must never reveal whether
  // an email is on the guest list.
  return redirect("/rsvp?sent=1", 303);
};
