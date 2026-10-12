import type { APIRoute } from "astro";
import { getGuestByToken } from "../../../lib/guests";
import { startCheckout } from "../../../lib/checkout";

export const prerender = false;

/** The Pay buttons on a guest's page. See startCheckout() in src/lib/checkout.ts. */
export const POST: APIRoute = async ({ params, redirect }) => {
  const token = params.token ?? "";
  const guestUrl = `/rsvp/${encodeURIComponent(token)}`;

  const guest = await getGuestByToken(token);
  if (!guest) return redirect(guestUrl, 303);

  const result = await startCheckout(guest);
  if (result.ok) return redirect(result.url, 303);
  return redirect(result.reason === "error" ? `${guestUrl}?payerror=1#rsvp-status` : `${guestUrl}#rsvp-status`, 303);
};
