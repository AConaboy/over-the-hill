// Shared constants for the "remember this guest" cookie, so the pages that
// set it (rsvp/[token], ticket/[token]) and the page that reads it
// (rsvp/index) all agree on the name/lifetime. Astro's cookie API is used
// directly in each page — this file just holds the shared config.

export const REMEMBER_COOKIE_NAME = "oth_guest";

// ~400 days: comfortably past the event, and the max Chrome will honour
// for a cookie's Max-Age anyway.
export const REMEMBER_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const REMEMBER_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: REMEMBER_COOKIE_MAX_AGE_SECONDS,
};
