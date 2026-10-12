// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Short content hashes for the hand-written CSS and JS in public/, added to
// their URLs (see src/lib/assets.ts) so browsers can cache them for a year
// and still pick up every change.
const VERSIONED_ASSETS = ['/css/style.css', '/js/butterfly.js', '/js/flowers.js', '/js/nav.js', '/js/admin.js', '/favicon-animate.js'];
const assetHashes = Object.fromEntries(
  VERSIONED_ASSETS.map((path) => [path, createHash('sha256').update(readFileSync(`public${path}`)).digest('hex').slice(0, 10)]),
);

// The Content Security Policy, sent by src/middleware.ts on every page. No
// inline scripts run except these two, which Poster.astro copies in
// verbatim from their files, so their hashes are worked out from the files
// here (never from the page being served, or an injected script would be
// allowed too). Everything else comes from this site, bar the location
// page's map, and the redirects to Stripe's checkout and to Cloudflare
// Access's sign-in (admin) that follow a form post.
const INLINE_SCRIPTS = ['public/js/motion.js', 'public/js/continuity.js', 'public/js/sunrise.js'];
const scriptHashes = INLINE_SCRIPTS.map((file) => `'sha256-${createHash('sha256').update(readFileSync(file)).digest('base64')}'`);
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' ${scriptHashes.join(' ')}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  // Google's map on Location; our own email previews in admin Emails
  "frame-src 'self' https://www.google.com",
  "form-action 'self' https://checkout.stripe.com https://*.cloudflareaccess.com",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    // the QA suite's own dev server keeps a separate cache (qa/playwright.config.ts)
    cacheDir: process.env.QA_VITE_CACHE || undefined,
    // The server's own dependencies, bundled when the dev server starts rather
    // than when a page first uses one: a dependency found mid-run makes Vite
    // rebuild its cache under the running Worker, which then fails with "The
    // file does not exist at …/deps_ssr/…" until the cache is cleared.
    environments: {
      ssr: { optimizeDeps: { include: ['jose', 'pdf-lib', 'qrcode', 'stripe', 'mustache', 'resend'] } },
    },
    define: {
      __ASSET_HASHES__: JSON.stringify(assetHashes),
      __CONTENT_SECURITY_POLICY__: JSON.stringify(contentSecurityPolicy),
    },
  },
  adapter: cloudflare({
    imageService: 'compile',
  }),
  env: {
    schema: {
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      // Inlined at build time (public vars aren't read at runtime), so the
      // production URL is the default — set SITE_URL in .env to override
      // it for local dev.
      SITE_URL: envField.string({ context: 'server', access: 'public', default: 'https://overthehill.live' }),
      // Cloudflare Access (admin protection) — see docs/deployment.md step 4.
      // Optional so local dev works without them; in production, admin
      // routes refuse all requests until both are set.
      CF_ACCESS_TEAM_DOMAIN: envField.string({ context: 'server', access: 'secret', optional: true }),
      CF_ACCESS_AUD: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Stripe (v2 payments) — per-environment Worker secrets, see
      // docs/deployment.md. Optional: without them payments stay closed.
      STRIPE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      STRIPE_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
