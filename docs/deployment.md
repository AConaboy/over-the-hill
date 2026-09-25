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

## 3. Cloudflare (hosting) and deploying

This app builds as a Cloudflare Worker with static assets (the
`@astrojs/cloudflare` adapter's current model), not the older Pages-only
flow. There are two environments, both declared in `wrangler.jsonc`:

| | Production | Staging |
|---|---|---|
| URL | `overthehill.live` | `staging.overthehill.live` (hosts only) |
| Worker | `over-the-hill` | `over-the-hill-staging` |
| D1 database | `over-the-hill` | `over-the-hill-staging` |
| Deployed by | a push to `main` | a push to any other branch |

**Deploys run from GitHub Actions** (`.github/workflows/deploy.yml`). Don't
deploy from your laptop. Each deploy does, in order:

1. Checks (`.github/workflows/checks.yml`): type-check, unit tests, build.
   The same workflow runs on every PR, and it's the check `main` requires.
2. A build for the target environment. The environment is chosen **at build
   time**: `CLOUDFLARE_ENV=staging` makes the Astro adapter write a
   `dist/server/wrangler.json` for staging, and `SITE_URL` is baked in then
   too. So `wrangler deploy` takes no `--env`.
3. `wrangler d1 migrations apply ... --remote` for that environment's
   database. Migrations run before the new code goes live, so they must
   only ever *add* things (new tables/columns), never rename or drop.
4. `wrangler deploy`.

Staging is shared, so the last branch pushed is what's on it. Pushes that
only touch `docs/` or Markdown files don't deploy.

`SITE_URL` is *not* a Worker secret: Astro bakes it into the build. It
defaults to `https://overthehill.live` in `astro.config.mjs`, and the
workflow overrides it for staging. Setting it with `wrangler secret put` has
no effect.

### One-off setup

Already done for production. To set up staging (or redo it):

1. **Staging database:** `npx wrangler d1 create over-the-hill-staging`, and
   put the printed `database_id` into `env.staging` in `wrangler.jsonc`. The
   first staging deploy applies every migration, including the site text.
2. **Staging Access app:** as in step 4 below, but with destination
   `staging.overthehill.live` and **no path**, so the whole staging site is
   hosts-only. Put its AUD tag in `env.staging.vars.CF_ACCESS_AUD`.
3. **Cloudflare API token for CI** (dashboard → My Profile → API Tokens →
   Create custom token):
   - Account → Workers Scripts: Edit
   - Account → Workers KV Storage: Edit (the Astro adapter declares a
     `SESSION` KV binding, which wrangler creates on a Worker's first deploy)
   - Account → D1: Edit
   - Account → Account Settings: Read
   - Zone `overthehill.live` → Workers Routes: Edit, DNS: Edit (for the
     custom domains)
4. **GitHub** (needs repo admin), Settings → Environments:
   - `staging`: any branch. `production`: deployment branches limited to
     `main`, so feature branches can never use production's credentials.
   - In **both**, add secrets `CLOUDFLARE_API_TOKEN` (the token above) and
     `CLOUDFLARE_ACCOUNT_ID`.
   - Settings → Branches: protect `main`, requiring a PR and the
     "Type-check, test and build" check.
5. **Resend key per Worker**, after each Worker's first deploy:
   `npx wrangler secret put RESEND_API_KEY` (production) and
   `npx wrangler secret put RESEND_API_KEY --env staging` (use a separate
   key). Staging sends real emails, so use hosts' own addresses for test
   guests.

### Resetting staging

A migration from an abandoned branch stays applied to the staging database.
To start clean: `npx wrangler d1 delete over-the-hill-staging`, create it
again (step 1 above, new `database_id`), and push. The next deploy re-runs
every migration.

### Emergency manual deploy

Only if Actions is unavailable. Production (from an up-to-date `main`):
`npm run build && npx wrangler d1 migrations apply over-the-hill --remote && npx wrangler deploy`.
Staging: the same with `CLOUDFLARE_ENV=staging SITE_URL=https://staging.overthehill.live`
before `npm run build`, and `over-the-hill-staging --remote --env staging`
for the migrations.

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

   Then push, so the deploy workflow picks it up.
7. Test in an incognito window: `/admin` should redirect to Cloudflare's
   login. After you sign in with an allowed email, the guest list loads.
   (The `*.workers.dev` address, which skips Access, is switched off in
   `wrangler.jsonc`; the middleware would refuse admin requests there
   anyway.)

## 5. DNS

Both hostnames are declared as custom domains in `wrangler.jsonc`
(`routes` with `custom_domain: true`). `overthehill.live` is on Cloudflare
DNS, so `wrangler deploy` creates the DNS record and certificate itself.
Nothing to do by hand.

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

Deposits/paid tickets (Stripe Checkout Sessions + a webhook) are described in
`docs/signup-ticketing-spec.md` but intentionally not implemented in this
version — the `amount_due_pence`, `amount_paid_pence`, `payment_ref`,
`payment_status` and `is_performer` columns already exist in the schema so that work won't
need a migration.
