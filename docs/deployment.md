# Deployment

This app needs a few external services wired up by hand — none of this can be
scripted from inside the repo. Do these once, in order.

## 1. Cloudflare D1 (database)

`wrangler.jsonc` already declares a `DB` binding pointing at a database named
`over-the-hill` — you just need to create the real thing and fill in its id.

1. Log in once: `npx wrangler login`.
2. Create the database: `npx wrangler d1 create over-the-hill`. This prints a
   `database_id` — copy it into `wrangler.jsonc`, replacing
   `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
3. Apply the schema to the real (remote) database:
   `npx wrangler d1 migrations apply over-the-hill --remote`. This creates
   the `guests` and `guest_inviters` tables. D1 has no public network
   endpoint at all — it's reachable only via this binding, from our own
   server-side code — so there's no separate key or secret to manage for it,
   unlike a hosted-database-over-HTTP setup.
4. Import the existing guest spreadsheet: either add guests one at a time via
   the admin page (`/admin/guests/new`) once deployed, which generates each
   guest's `token` and handles multiple inviters in one step, or write a
   one-off `INSERT` script and run it with
   `npx wrangler d1 execute over-the-hill --remote --file=your-script.sql`.

For local development, there's also a **local** D1 instance (a SQLite file
under `.wrangler/`, gitignored) that `astro dev` uses automatically — apply
the same migration to it once with
`npx wrangler d1 migrations apply over-the-hill --local` (omit `--remote`).
If you ever change the binding in `wrangler.jsonc`, rerun
`npx wrangler types` to regenerate `worker-configuration.d.ts`.

## 2. Resend (confirmation emails)

1. Create a free account at [resend.com](https://resend.com).
2. Verify a sending domain (or use Resend's testing domain while developing).
3. Create an API key → `RESEND_API_KEY`.
4. Update the `FROM_ADDRESS` constant in `src/lib/email.ts` to an address on
   your verified domain (it currently defaults to a placeholder
   `rsvp@overthehill.xyz`).

## 3. Cloudflare (hosting)

**Note:** this app builds as a Cloudflare Worker with static assets (the
`@astrojs/cloudflare` adapter's current model — Cloudflare has been merging
"Pages" into "Workers"), not the older Pages-only git-connected build flow.
The most direct path is deploying with `wrangler` from your machine or CI,
which also picks up the D1 binding and everything else already declared in
`wrangler.jsonc` automatically:

1. Add the one remaining secret (D1 needs none, per step 1 above):
   `npx wrangler secret put RESEND_API_KEY`. `SITE_URL` is *not* a Worker
   secret: Astro bakes it into the build, and it defaults to
   `https://overthehill.live` in `astro.config.mjs`. Change that default if
   the production domain ever changes. Setting it with `wrangler secret put`
   has no effect.
2. Deploy: `npm run build && npx wrangler deploy`. Cloudflare will give you a
   `*.workers.dev` URL to test against before pointing your real domain at
   it.

If you'd rather use Cloudflare's git-connected dashboard flow instead of
deploying from the command line, that's also possible (**Workers & Pages →
Create → Connect to Git**, framework preset **Astro**) — just make sure the
D1 binding and secrets are configured there too, since a dashboard-managed
deploy won't automatically read `wrangler.jsonc` the same way `wrangler
deploy` does.

## 4. Cloudflare Access (admin page protection)

The admin pages (`/admin/*`) and their API (`/api/admin/*`) have no login of
their own. Cloudflare Access protects them at the edge, so unauthenticated
requests never reach the app. As a second layer, `src/middleware.ts` checks
the signed JWT that Access adds to every request it lets through, and refuses
admin requests that lack a valid one (for example via the `*.workers.dev`
URL). Until the two variables below are set, the deployed admin returns 403
to everyone.

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications →
   Add an application → Self-hosted**. (First time only: Zero Trust asks you
   to pick a team name. This becomes `<team>.cloudflareaccess.com`. The free
   plan is fine.)
2. Add **two** destinations (public hostnames) to the same application:
   - `overthehill.live`, path `admin`
   - `overthehill.live`, path `api/admin`

   A path covers everything beneath it, so these match `/admin/guests/new`,
   `/api/admin/guests/123`, and so on.
3. Add a policy (e.g. "Hosts") with action **Allow** and an include rule of
   **Emails** listing each host's email address.
4. Keep the default one-time-PIN login method (or add Google as a login
   method if you prefer).
5. Save, then open the application's **Overview/Basic information** and copy
   the **Application Audience (AUD) Tag**.
6. Give the Worker the team domain and AUD tag. Neither value is sensitive,
   so they can go in `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "CF_ACCESS_TEAM_DOMAIN": "https://<team>.cloudflareaccess.com",
     "CF_ACCESS_AUD": "<AUD tag>"
   }
   ```

   Then rebuild and deploy (`npm run build && npx wrangler deploy`).
7. Test in an incognito window:
   - `/admin` should redirect to Cloudflare's login. After you sign in with an
     allowed email, the guest list loads.
   - `https://over-the-hill.<subdomain>.workers.dev/admin` should return 403
     (it bypasses Access, so the middleware blocks it).

## 5. DNS

Point your domain's DNS at your deployed Worker per Cloudflare's own
instructions for **Custom domains** (Cloudflare handles this automatically
if the domain's nameservers are already on Cloudflare).

## Local development

```sh
cp .env.example .env                                    # fill in a real Resend value
npm install
npx wrangler d1 migrations apply over-the-hill --local   # once, to set up the local DB
npm run dev
```

`SITE_URL` for local testing comes from the committed `.env.development`
(`http://localhost:4321`), which only `astro dev` loads. Don't put
`SITE_URL` in `.env`: that file also applies to `npm run build` and would
bake localhost links into a production deploy. The admin page
has no auth locally (Cloudflare Access only applies once deployed), so don't
expose your local dev server publicly.

## What's not built yet (v2)

Deposits/paid tickets (Stripe Payment Links + a webhook) are described in
`docs/signup-ticketing-spec.md` but intentionally not implemented in this
version — the `amount_due_pence`, `amount_paid_pence`, `payment_ref`, and
`payment_status` columns already exist in the schema so that work won't
need a migration.
