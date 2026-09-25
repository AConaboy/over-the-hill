import type { APIRoute } from "astro";
import { getGuestByToken } from "../../../lib/guests";
import { startCheckout } from "../../../lib/checkout";

export const prerender = false;

/** The ticket page's Pay button. See startCheckout() in src/lib/checkout.ts. */
export const POST: APIRoute = async ({ params, redirect }) => {
  const token = params.token ?? "";
  const ticketUrl = `/ticket/${encodeURIComponent(token)}`;

  const guest = await getGuestByToken(token);
  if (!guest) return redirect(ticketUrl, 303);

  const result = await startCheckout(guest);
  if (result.ok) return redirect(result.url, 303);
  return redirect(result.reason === "error" ? `${ticketUrl}?payerror=1` : ticketUrl, 303);
};
