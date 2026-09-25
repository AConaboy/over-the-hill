import { defineMiddleware } from "astro:middleware";
import { CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN } from "astro:env/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Admin pages and APIs are protected by Cloudflare Access at the edge (see
// docs/deployment.md). This is a second check inside the app: every admin
// request must carry a valid Access JWT for our application, so anything
// that slips past the edge — the *.workers.dev URL, a preview URL, a path
// the Access app doesn't cover — is refused rather than served.
const ADMIN_PATH = /^\/(api\/)?admin(\/|$)/;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export const onRequest = defineMiddleware(async (context, next) => {
  if (!ADMIN_PATH.test(context.url.pathname)) return next();

  // Access only exists once deployed, so local dev has no admin auth.
  if (import.meta.env.DEV) return next();

  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    return new Response("Admin is locked: Cloudflare Access is not configured.", { status: 403 });
  }

  const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return new Response("Forbidden", { status: 403 });

  const issuer = CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  try {
    await jwtVerify(token, jwks, { issuer, audience: CF_ACCESS_AUD });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  return next();
});
