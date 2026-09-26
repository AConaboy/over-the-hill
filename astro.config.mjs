// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Short content hashes for the hand-written CSS and JS in public/, added to
// their URLs (see src/lib/assets.ts) so browsers can cache them for a year
// and still pick up every change.
const VERSIONED_ASSETS = ['/css/style.css', '/js/sunrise.js', '/js/butterfly.js', '/favicon-animate.js'];
const assetHashes = Object.fromEntries(
  VERSIONED_ASSETS.map((path) => [path, createHash('sha256').update(readFileSync(`public${path}`)).digest('hex').slice(0, 10)]),
);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    define: { __ASSET_HASHES__: JSON.stringify(assetHashes) },
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
