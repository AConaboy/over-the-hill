# Deployment

This app needs a few external services wired up by hand — none of this can be
scripted from inside the repo. Do these once, in order.

## 1. Supabase (database)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `supabase/migrations/0001_init.sql` (paste its
   contents and execute). This creates the `guests` and `guest_inviters`
   tables with RLS enabled and no policies — the app talks to them only via
   the service role key, server-side.
3. From **Project Settings → API**, note down:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses RLS and must stay a secret — never expose it
   to the browser.
4. Import the existing guest spreadsheet: either use the Table Editor's CSV
   import into `guests` (name/email/phone columns; `token` and
   `token_expires_at` fill in automatically from their defaults), then add
   rows to `guest_inviters` for who invited whom — or just add guests one at
   a time via the admin page (`/admin/guests/new`) once deployed, which
   handles both in one step.

## 2. Resend (confirmation emails)

1. Create a free account at [resend.com](https://resend.com).
2. Verify a sending domain (or use Resend's testing domain while developing).
3. Create an API key → `RESEND_API_KEY`.
4. Update the `FROM_ADDRESS` constant in `src/lib/email.ts` to an address on
   your verified domain (it currently defaults to a placeholder
   `rsvp@overthehill.xyz`).

## 3. Cloudflare Pages (hosting)

1. Push this repo to GitHub (it already is) and connect it in the Cloudflare
   dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset: **Astro**. Build command `npm run build`, build output
   directory `dist`.
3. Under the project's **Settings → Environment variables**, add as
   **secrets** (not plain vars, since they're sensitive):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `SITE_URL` — the production URL once you have it (e.g.
     `https://overthehill.xyz`); used to build the links in confirmation
     emails and the QR codes. Set the same variables for the Preview
     environment too (with a preview `SITE_URL`) if you want to test on a
     preview deploy before going live.
4. Trigger a deploy. Cloudflare will build and give you a `*.pages.dev` URL
   to test against before pointing your real domain at it.

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

Point your domain's DNS at Cloudflare Pages per Cloudflare's own instructions
for **Custom domains** on the Pages project (Cloudflare handles this
automatically if the domain's nameservers are already on Cloudflare).

## Local development

```sh
cp .env.example .env   # fill in real Supabase/Resend values
npm install
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
