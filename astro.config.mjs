// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
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
    },
  },
});
