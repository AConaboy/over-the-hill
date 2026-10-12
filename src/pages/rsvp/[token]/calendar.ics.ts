import type { APIRoute } from "astro";
import { getGuestByToken } from "../../../lib/guests";
import { festivalCalendar } from "../../../lib/calendar";
import { SITE_URL } from "astro:env/server";

export const prerender = false;

/** "Add to calendar": the festival, linking back to their page. Fetching it
 * doesn't count as opening their invite (no markViewed). */
export const GET: APIRoute = async ({ params }) => {
  const guest = params.token ? await getGuestByToken(params.token) : null;
  if (!guest) return new Response("Not found", { status: 404 });
  const pageUrl = new URL(`/rsvp/${guest.token}`, SITE_URL).toString();
  return new Response(festivalCalendar(pageUrl, `festival-2027-${guest.id}`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="over-the-hill.ics"',
      "Cache-Control": "private, no-store",
    },
  });
};
