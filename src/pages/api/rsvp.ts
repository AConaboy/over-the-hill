import type { APIRoute } from "astro";
import {
  submitRsvp,
  markConfirmationEmailSent,
  markRegistered,
  getGuestById,
  canSendConfirmationEmail,
  CAMPING_VALUES,
  VEHICLE_VALUES,
  DAY_VALUES,
  LIFT_VALUES,
  GLAMPING_VALUES,
} from "../../lib/guests";
import { sendPaymentDueEmail, sendRsvpConfirmationEmail } from "../../lib/email";
import { getPaymentSettings } from "../../lib/settings";
import { nextPayment, type NextPayment } from "../../lib/payments";
import { isStripeConfigured } from "../../lib/stripe";
import { startCheckout } from "../../lib/checkout";
import { choiceField, LONG_TEXT_MAX, smallNumberField, textField } from "../../lib/forms";
import { getSpotifyStatus, listGuestSongs, saveGuestSongs, songsOpen } from "../../lib/spotify";
import { songsFromForm } from "../../lib/songs";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const token = textField(form, "token") ?? "";
  const rsvpUrl = `/rsvp/${encodeURIComponent(token)}`;

  // The form requires a yes/no answer; anything else is a hand-crafted
  // request, so don't save it (or email a "declining" summary for it).
  const attendance = choiceField(form, "attendance", ["yes", "no"] as const);
  if (!attendance) {
    return redirect(rsvpUrl, 303);
  }

  const result = await submitRsvp(token, {
    attendance,
    email: textField(form, "email"),
    phone: textField(form, "phone"),
    arrivalDay: choiceField(form, "arrivalDay", DAY_VALUES),
    departureDay: choiceField(form, "departureDay", DAY_VALUES),
    camping: choiceField(form, "camping", CAMPING_VALUES),
    vehicle: choiceField(form, "vehicle", VEHICLE_VALUES),
    dietary: textField(form, "dietary", LONG_TEXT_MAX),
    accessibility: textField(form, "accessibility", LONG_TEXT_MAX),
    notes: textField(form, "notes", LONG_TEXT_MAX),
    lift: choiceField(form, "lift", LIFT_VALUES),
    liftFrom: textField(form, "liftFrom"),
    liftSeats: smallNumberField(form, "liftSeats", 20),
    glamping: choiceField(form, "glamping", GLAMPING_VALUES),
  });

  if (!result.ok) {
    // Invalid or expired token: send them back to the same URL, which will
    // render the appropriate "not found"/"expired" state on reload.
    return redirect(rsvpUrl, 303);
  }

  // Their songs for the playlist, before any email (which lists them).
  // Only when the form had the songs section (it's hidden while Spotify
  // isn't set up), so an empty list means they cleared them; saying no
  // clears them too. Non-blocking: Spotify failing never stops the RSVP.
  let songProblem = false;
  const songsShown = form.get("songsShown") === "1";
  if (songsShown || result.guest.attendance !== "yes") {
    try {
      const songs = songsFromForm(form.getAll("songs").map(String));
      const clearing = result.guest.attendance !== "yes";
      if (clearing ? (await listGuestSongs(result.guest.id)).length > 0 : songsOpen(await getSpotifyStatus())) {
        const saved = await saveGuestSongs(result.guest.id, clearing ? [] : songs.ids);
        songProblem = !clearing && (saved.dropped > 0 || songs.invalid > 0);
      }
    } catch (err) {
      console.error("Saving songs failed", err);
      songProblem = result.guest.attendance === "yes";
    }
  }

  // Saying yes completes registration straight away only when nothing is
  // payable (payments closed, or a free performer). Otherwise their answers
  // are saved (above) and they go straight on to pay — the deposit, or the
  // whole price when there's no deposit — which is what completes it: see
  // recordPayment() in src/lib/guests.ts.
  let guest = result.guest;
  let paymentDue: Exclude<NextPayment, { kind: "none" }> | null = null;
  if (guest.attendance === "yes" && !guest.registered_at) {
    const next = nextPayment(guest, await getPaymentSettings(), isStripeConfigured());
    if (next.kind !== "none") {
      paymentDue = next;
    } else {
      await markRegistered(guest.id);
      guest = (await getGuestById(guest.id)) ?? guest;
    }
  }

  // Non-blocking: a failed email send must never stop the RSVP from saving.
  let emailed = false;
  if (guest.email && canSendConfirmationEmail(guest)) {
    try {
      if (paymentDue !== null) {
        await sendPaymentDueEmail(guest, paymentDue);
      } else {
        await sendRsvpConfirmationEmail(guest);
      }
      await markConfirmationEmailSent(guest.id);
      emailed = true;
    } catch (err) {
      console.error("Failed to send RSVP email", err);
    }
  }

  const submittedUrl = `${rsvpUrl}?submitted=1${result.wasReplied ? "&updated=1" : ""}${emailed ? "&emailed=1" : ""}${songProblem ? "&songs=problem" : ""}`;
  if (paymentDue !== null) {
    const checkout = await startCheckout(guest);
    if (checkout.ok) return redirect(checkout.url, 303);
    // Couldn't reach Stripe: their answers are saved, and the page offers
    // the Pay button to try again.
    return redirect(`${submittedUrl}${checkout.reason === "error" ? "&payerror=1" : ""}#rsvp-status`, 303);
  }
  return redirect(`${submittedUrl}#rsvp-status`, 303);
};
