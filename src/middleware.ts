import { defineMiddleware, sequence } from "astro:middleware";
import { CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN } from "astro:env/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Admin pages and APIs are protected by Cloudflare Access at the edge (see
// docs/deployment.md). This is a second check inside the app: every admin
// request must carry a valid Access JWT for our application, so anything
// that slips past the edge — the *.workers.dev URL, a preview URL, a path
// the Access app doesn't cover — is refused rather than served.
const ADMIN_PATH = /^\/((api\/)?admin|checkin)(\/|$)/;

// Pages whose URL carries a guest's token, or that are hosts-only — never
// worth a search engine indexing, even if a link ends up somewhere public.
const NOINDEX_PATH = /^\/(rsvp|ticket|admin|checkin)\//;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

const requireAccess = defineMiddleware(async (context, next) => {
  if (!ADMIN_PATH.test(context.url.pathname)) return next();

  // Access only exists once deployed, so local dev has no admin auth.
  if (import.meta.env.DEV) {
    context.locals.hostEmail = "host (dev)";
    return next();
  }

  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    return new Response("Admin is locked: Cloudflare Access is not configured.", { status: 403 });
  }

  const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return new Response("Forbidden", { status: 403 });

  const issuer = CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: CF_ACCESS_AUD });
    // who's doing this, for guests' history
    context.locals.hostEmail = typeof payload.email === "string" ? payload.email : "a host";
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  return next();
});

// The full Content Security Policy (astro.config.mjs). Only in the built
// site: the dev server injects its own inline scripts, so dev keeps just
// frame-ancestors.
declare const __CONTENT_SECURITY_POLICY__: string;

// admin Emails' preview of an email (an email carries its own inline
// styles and web fonts, and no scripts), shown in a frame on that page.
const EMAIL_PREVIEW_PATH = /^\/api\/admin\/emails\/[^/]+\/preview$/;
const EMAIL_PREVIEW_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "frame-ancestors 'self'",
].join("; ");

// Static files get the same headers from public/_headers.
const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = response.headers;

  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Nothing here uses the camera, microphone or location; payment only on
  // our own pages (Stripe's checkout is its own site).
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  headers.set("X-Content-Type-Options", "nosniff");
  // Nothing here is meant to be framed; this stops clickjacking, e.g. a
  // host being tricked into pressing "Regenerate link" inside an iframe.
  if (EMAIL_PREVIEW_PATH.test(context.url.pathname)) {
    headers.set("Content-Security-Policy", EMAIL_PREVIEW_POLICY);
    headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    headers.set("Content-Security-Policy", import.meta.env.DEV ? "frame-ancestors 'none'" : __CONTENT_SECURITY_POLICY__);
    headers.set("X-Frame-Options", "DENY");
  }
  // Guest tokens live in URLs, so never send a path to another site.
  headers.set("Referrer-Policy", "same-origin");
  if (NOINDEX_PATH.test(context.url.pathname)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
});

export const onRequest = sequence(securityHeaders, requireAccess);
