import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import {
  getGuestsByEmail,
  canSendMagicLink,
  markMagicLinkSent,
  isLinkExpired,
  type Guest,
} from "../../../lib/guests";
import { sendMagicLinkEmail } from "../../../lib/email";
import { textField } from "../../../lib/forms";

export const prerender = false;

async function sendLinks(guests: Guest[]): Promise<void> {
  for (const guest of guests) {
    // An unanswered link that's lapsed would only land them on "This link
    // has expired". Issuing a fresh one is a host's call, not self-service,
    // so skip it (the response is the same either way).
    if (isLinkExpired(guest) || !canSendMagicLink(guest)) continue;

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

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const email = textField(form, "email");

  if (email) {
    // Sent after the response goes out, so a matching address doesn't
    // answer measurably slower than an unknown one.
    waitUntil(sendLinks(await getGuestsByEmail(email)));
  }

  // Always the same redirect regardless of whether we found a match, sent
  // anything, or hit the cooldown — the response must never reveal whether
  // an email is on the guest list.
  return redirect("/rsvp?sent=1", 303);
};
