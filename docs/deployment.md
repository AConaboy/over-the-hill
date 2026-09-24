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

1. Add the two remaining secrets (D1 needs none, per step 1 above):
   `npx wrangler secret put RESEND_API_KEY` and
   `npx wrangler secret put SITE_URL` (use your production URL once you have
   one, e.g. `https://overthehill.xyz`).
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

`/admin/*` has no login page of its own — it's protected entirely by
Cloudflare at the edge, so unauthenticated requests never reach the app.

1. In the Cloudflare dashboard, go to **Zero Trust → Access → Applications →
   Add an application → Self-hosted**.
2. Application domain: your site's domain, path `/admin`.
3. Add a policy (e.g. "Hosts") with action **Allow**, and an include rule of
   **Emails** listing each host's email address.
4. Leave the default one-time-PIN login method enabled (or add Google as a
   login method if you prefer) — no extra app config is needed for this.
5. Test by visiting `/admin` signed out (e.g. an incognito window): you
   should be redirected to Cloudflare's login prompt before ever reaching
   the guest list.

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

`SITE_URL` in `.env` should be `http://localhost:4321` for local testing —
links in confirmation emails and QR codes will point there. The admin page
has no auth locally (Cloudflare Access only applies once deployed), so don't
expose your local dev server publicly.

## What's not built yet (v2)

Deposits/paid tickets (Stripe Payment Links + a webhook) are described in
`docs/signup-ticketing-spec.md` but intentionally not implemented in this
version — the `amount_due_pence`, `amount_paid_pence`, `payment_ref`, and
extra `status` values already exist in the schema so that work won't need a
migration.
