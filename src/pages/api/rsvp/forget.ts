import type { APIRoute } from "astro";
import { REMEMBER_COOKIE_NAME, RSVPED_COOKIE_NAME } from "../../../lib/rememberCookie";

export const prerender = false;

// "Not you? Forget this device" on a guest's page: stops this browser going
// straight to their page (with their details) from /rsvp, e.g. on a shared
// or borrowed device. Their link itself keeps working.
export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete(REMEMBER_COOKIE_NAME, { path: "/" });
  cookies.delete(RSVPED_COOKIE_NAME, { path: "/" });
  return redirect("/", 303);
};
