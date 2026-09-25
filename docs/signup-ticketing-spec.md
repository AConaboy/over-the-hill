# Sign-up / Ticketing Spec

## Context

The site currently lives as hand-written static HTML pages (no build step, no backend). RSVP is a plain form posting to Formspree, and `ticket.html` is a stub with a "Paying — TBD" note left as a placeholder. We have a spreadsheet of invited guests and who invited them, and want to move to per-guest, protected sign-up links, store responses in a real database (not just Formspree emails), show guests a confirmation/ticket (QR) on sign-up, and eventually collect a deposit and convert sign-ups into paid tickets — without having to re-architect when that day comes.

This spec migrates the whole site to a small framework rather than bolting a database onto raw HTML, since we're not attached to the current stack.

## Architecture

- **Framework: Astro.** The site is almost entirely static content (about/camping/food/activities/travel/faq/line-up/game) with only two pages needing real interactivity (RSVP, ticket). Astro components are close to plain HTML/CSS, so migrating the existing pages is near copy-paste, and only the RSVP/ticket/admin pages need client-side JS ("islands"). This avoids the overhead of converting every page into React (which a full Next.js migration would require) while still giving us npm, a build step, server endpoints, and typed data.
- **Hosting: Cloudflare**, using the official `@astrojs/cloudflare` SSR adapter. This builds and deploys the app as a single **Cloudflare Worker with static assets** (`wrangler deploy`) — Cloudflare's current model, having merged what used to be the separate "Pages" product into "Workers" — rather than the older Pages-dashboard git-connected build flow. Astro pages render on the Worker; API routes are handlers within that same Worker. This meets all our needs (server-side secrets, dynamic routes, a webhook target for v2) and deploys with a single `wrangler deploy`, which also picks up the D1 binding and secrets declared in `wrangler.jsonc` automatically. (Cloudflare's older git-connected dashboard flow still works too, if preferred, but needs the D1 binding and secrets configured there separately since it won't read `wrangler.jsonc`.)
- **Database: Cloudflare D1** (their serverless SQLite). D1 has no public network endpoint at all — it's reachable only via a binding declared in `wrangler.jsonc` and accessed in code via Cloudflare's `cloudflare:workers` runtime import, so only our own server-side code can ever query it; there's no API key that could leak, unlike a hosted-Postgres-over-HTTP setup. The server is still the trust boundary in application terms: it only ever looks up a guest by the token supplied in the URL, never lists all guests to unauthenticated callers. Chosen over a hosted-Postgres option (e.g. Supabase) since everything here is already server-side-only with no use of client-side REST/Auth/realtime features — D1 gives the same capability with lower latency (native binding vs. an external HTTPS call), no separate vendor/account, and no free-tier "project sleeps after a week of inactivity" behaviour to worry about between invite waves. The trade-off: no Supabase-style Table Editor GUI for eyeballing raw data by hand (the admin page is the intended way to view/edit data instead), and D1's data is tied to Cloudflare specifically rather than portable standard Postgres.
- **Guest links use a path segment**, e.g. `https://overthehill.xyz/rsvp/<token>`, not a query string — idiomatic for Astro dynamic routes (`src/pages/rsvp/[token].astro`) and easy to hand out as a single copy-pasteable link.
- **Transactional email: Resend.** Used only for the automated RSVP confirmation email (see below) — a lightweight fit for a Cloudflare Worker/serverless setup, with a free tier well within our volume. Called server-side from the RSVP API route using an API key stored as a Worker secret (`wrangler secret put`).
- **Admin auth: Cloudflare Access.** Rather than building our own login page and session handling, `/admin/*` is protected by a Cloudflare Access application (Zero Trust) sitting in front of the Worker — unauthenticated requests never reach Astro at all. This also gives us per-host identity for free (see "Admin page" below) instead of a single shared password.

## Data model (Cloudflare D1, two tables)

One `guests` row per invite (no plus-ones, so no attendee join table needed for that). `invited_by` is a **separate join table** since a guest can be invited by more than one person.

D1 is SQLite, so a few things are written differently than they would be in Postgres: there's no `uuid` type or `gen_random_uuid()` — ids/tokens are generated in application code (`crypto.randomUUID()`, available in the Workers runtime) and passed in on insert, rather than filled in by a database default. Timestamps are stored as ISO 8601 `text` rather than `timestamptz`, and `token_expires_at` is computed in application code (`now + 30 days`) at insert/regenerate time rather than via an `interval` default.

```sql
create table guests (
  id                text primary key,            -- crypto.randomUUID(), set by app on insert
  token             text unique not null,        -- crypto.randomUUID(), guest's link credential
  token_expires_at  text not null,                -- ISO 8601; app sets to now + 30 days, see "Link expiry" below
  ticket_ref        text unique,                  -- short code, set once attendance = 'yes'

  name              text not null,
  email             text,
  phone             text,

  attendance        text not null default 'pending' check (attendance in ('pending','yes','no')),
  arrival_day       text,
  departure_day     text,
  camping           text check (camping in ('camping','not_camping','undecided')),
  vehicle           text check (vehicle in ('none','car','campervan','undecided')),
  dietary           text,
  accessibility     text,
  notes             text,

  status            text not null default 'invited' check (status in (
                      'invited','viewed','rsvp_yes','rsvp_no',
                      'deposit_paid','paid_full','cancelled'   -- deposit_paid/paid_full retired, see payment_status
                    )),
  -- added in migration 0005: payment state is separate from the RSVP
  -- lifecycle, so resubmitting an RSVP can't overwrite a payment
  payment_status    text not null default 'unpaid' check (payment_status in ('unpaid','deposit_paid','paid_full')),

  -- v2 fields, present now so v2 needs zero migration. All amounts are
  -- GBP, stored as pence (integer) to avoid floating-point rounding:
  amount_due_pence  integer,                     -- per-guest price override: null = standard price,
                                                  -- 0 = free (skips payment); set for performers only
  amount_paid_pence integer default 0,
  payment_ref       text,                        -- Stripe client_reference_id / payment intent id

  checked_in_at     text,                          -- ISO 8601; future door check-in

  confirmation_email_sent_at text,                -- ISO 8601; last time we successfully emailed them

  -- added in migration 0006: performers use the same RSVP form, but the
  -- flag (and their price, in amount_due_pence) is set by hosts only
  is_performer      integer not null default 0 check (is_performer in (0, 1)),

  created_at        text not null,                 -- ISO 8601, set by app on insert
  updated_at        text not null                  -- ISO 8601, set by app on every write
);

-- a guest can be invited by more than one person, and an inviter isn't
-- necessarily another guest row, so this is a simple free-text join table
create table guest_inviters (
  id            text primary key,                 -- crypto.randomUUID(), set by app on insert
  guest_id      text not null references guests(id) on delete cascade,
  inviter_name  text not null,
  unique (guest_id, inviter_name)
);
```

## Security model for unique links

- Token = a random UUID per row (`crypto.randomUUID()`) — unguessable, no separate shared password needed. A shared passphrase would add friction without real protection in a friend group (people forward passphrases as casually as links), while the per-guest token already fully isolates one guest's data from another's.
- Guest-facing routes never expose a "list all guests" capability. `/rsvp/[token]` and `/ticket/[token]` each do a single lookup by token server-side. There's also no network path to the database at all except through our own server-side code, since D1 is only reachable via the Worker's binding — an even stronger guarantee than "RLS plus a service-role key," since there's nothing resembling a key that could leak in the first place.
- Invalid/unknown token → friendly "this link isn't valid, contact the hosts" page, not an error page.
- Resubmitting the RSVP form is allowed (matches the existing site copy: "if your plans change, complete it again") — it updates the row in place and does not regenerate `ticket_ref`, so a guest's QR code stays stable across edits.

## Link expiry

- Every generated link carries a `token_expires_at` (default **30 days** from when it was created/regenerated — an easy constant to tune if we want longer or shorter). This is checked only against `/rsvp/[token]`.
- **Expiry only applies before a guest has responded.** If `attendance` is still `'pending'` and `now() > token_expires_at`, `/rsvp/[token]` shows "This link has expired — ask your host for a new one" instead of the form.
- **Once a guest has submitted an RSVP (`attendance` is `'yes'` or `'no'`), their link never expires** — they still need it to view/update their answers, see their ticket, and (in v2) pay, so expiry stops applying the moment they've responded.
- **Regenerating a link**: from the admin page, a host can hit "Regenerate link" for any guest. This sets a brand new `token` and pushes `token_expires_at` out another 30 days from that moment — the old link stops working immediately (it no longer matches any row) and the guest needs the new one. Useful both for a lapsed invite and simply as a way to invalidate a link that may have been shared somewhere it shouldn't have been.
- The admin page's guest table shows each guest's expiry date (or "expired") alongside their link, so hosts can see who's about to lapse and nudge them, or regenerate proactively.

## v1 process flow (no payment)

1. **Import**: the existing spreadsheet (name + who invited them, plus email/phone if available) is imported into `guests` + `guest_inviters` — either via the admin page's "add guest" flow (below) or a one-off script for the initial bulk load, since a guest can have more than one inviter.
2. **Generate links**: the admin page lists every guest's `https://overthehill.xyz/rsvp/<token>` link for copying (also obtainable via one SQL query run through `wrangler d1 execute` if preferred).
3. **Distribute manually**: hosts copy each guest's personal link into email/WhatsApp themselves (no automated sending in v1).
4. **Guest opens their link** → `/rsvp/[token]` fetches their row server-side, pre-fills any previously-submitted answers.
5. **Guest submits** the form (attendance yes/no, dietary & allergies, contact email/phone, arrival/departure day, camping/accommodation) → an Astro API route validates the token again and writes the update.
6. **On success with attendance = yes**: page shows a confirmation plus a QR code (see below). On attendance = no: simple acknowledgement, no QR.
7. **Guest also receives a confirmation email** (see below) at the address they gave, summarising what they submitted and linking back to their personal ticket page.
8. **Guest can revisit `/ticket/[token]`** any time to see their current status and QR again.
9. **Hosts view, edit, and add guests** via the admin page (below) — in scope for v1.

## Admin page (v1 scope)

- **Route**: `/admin`, gated by **Cloudflare Access** — a Zero Trust policy allowing only a defined list of host email addresses. A host visiting `/admin` is redirected by Cloudflare to confirm their email with a one-time PIN (or Google sign-in, if we enable it) before ever reaching the page; no password to create, remember, or share. Adding or removing a host is just editing the allow-list in the Cloudflare dashboard — no code change. Astro itself trusts that anything reaching `/admin/*` has already been authenticated by Access; the signed `Cf-Access-Jwt-Assertion` header Access attaches can optionally be verified server-side too, as defense-in-depth, but isn't required to ship v1.
- **View**: table of all guests — name, inviter(s), attendance/status, contact info, camping/dietary/accessibility details, payment status, whether their confirmation email sent successfully, link expiry date — sortable/filterable, with each guest's `/rsvp/<token>` link shown for copying.
- **Filter by inviter**: a filter (e.g. a dropdown of inviter names, driven by `guest_inviters`) narrows the table to just the guests a given host invited, so each host can quickly find and copy links for their own invitees without scrolling the full list. Since a guest can have multiple inviters, filtering by one inviter surfaces that guest under each of their inviters.
- **Edit**: a host can correct any guest's details directly (e.g. fixing a typo'd email, adjusting attendance if told verbally) — writes through the same server-side D1 access as the guest-facing routes.
- **Add**: a form to add a new guest (name + one or more inviters + optional email/phone), which generates their `token` and surfaces their new personal link immediately — becomes the ongoing way to extend the invite list beyond the initial import.
- **Regenerate link**: a button per guest that issues them a fresh token and expiry (see "Link expiry" above) — for a lapsed link or one that needs invalidating.
- **Performers**: the add and edit forms have a "Performer" checkbox and a "Performer ticket price". These are the only places either can be set. Guests never see them, and the guest RSVP route never writes them. Performers get the same invite link and RSVP form as everyone else. The price is stored in `amount_due_pence`: blank means the standard price, `0` means free, anything else is that performer's own price. It only applies while the box is ticked; unticking "Performer" clears it. The guest table labels performers with their price and can filter to performers or guests only.

## QR / ticket display

- QR encodes a URL built from `ticket_ref` (a short code, distinct from the long-lived `token`), e.g. `https://overthehill.xyz/checkin/<ticket_ref>` — not the token itself, since the token is an edit credential and the QR may be shown to someone else at the gate.
- Generated with the `qrcode` npm package inside a small Astro island component (client or server-rendered SVG — either works now that we have a build step).
- v1 purpose: a lightweight "you're on the list" confirmation shown on screen (guest can also screenshot it) and included as a reference in their confirmation email.
- v2 purpose (no new QR issued): becomes the door check-in scan target (`checked_in_at` column already exists) and the same code a guest's ticket shows as "paid" once a deposit/payment lands — the guest's link and QR never change, only their status does.

## Email confirmation

- **When it's sent**: immediately after a successful RSVP submission (attending or not), and again on any resubmission — so a guest's inbox always reflects their latest answers rather than only their first submission.
- **Sent to**: the email address the guest entered in the form (not the inviter's).
- **Contents**: a short thank-you, a plain-text summary of what they submitted (attendance, camping, dates, dietary/accessibility notes), and a link back to their personal `/ticket/[token]` page where the QR and full details live — the email itself doesn't need to embed the QR image.
- **Non-blocking**: if the email fails to send (bad address, provider outage), the RSVP submission still succeeds and is saved — email delivery is a courtesy on top, not a requirement for the sign-up to count. `confirmation_email_sent_at` (added to the schema above) records the last successful send so the admin page can flag guests whose confirmation may not have arrived.
- **v2 note**: the same mechanism is reused later to email a "payment received" confirmation once a deposit/payment lands, using the same Resend integration.

## v2: deposit / payment flow

- **Currency: GBP throughout.** Checkout Sessions are created in GBP, and the `amount_due_pence`/`amount_paid_pence` columns store whole pence (e.g. £15.00 deposit = `1500`) to avoid floating-point rounding issues.
- **What each guest owes.** A guest's ticket price is their own `amount_due_pence` if set (performers only, set by hosts), otherwise the standard price. The standard price and deposit amount live in one config constant, not per row. So changing the standard price is a code/config change, and guests on it don't need their rows rewritten.
- **Free performers skip payment entirely.** When a performer's price is `0` (`hasNothingToPay()` in `src/lib/guests.ts`), there's no pay button and no Stripe session; their ticket shows "nothing to pay" and counts as settled. `payment_status` stays `unpaid` for them, so reporting should treat "price 0" as settled rather than checking `payment_status` alone. v1 already shows the "nothing to pay" copy.
- **Mechanism: Stripe Checkout Sessions**, created server-side, **replacing the earlier plan of Payment Links**. A Payment Link has one fixed price, so per-performer prices would need a separate link for every distinct amount, kept in sync by hand. Instead, a pay button on `/ticket/[token]` posts to `/api/pay/[token]`. That route re-checks the token, works out the amount (price, or deposit, minus `amount_paid_pence`), creates a Checkout Session with that amount and `client_reference_id=<ticket_ref>`, and redirects to Stripe. The amount is always computed on the server, so a guest can't change what they pay. This needs `STRIPE_SECRET_KEY` as a Worker secret alongside `STRIPE_WEBHOOK_SECRET`.
- **Deposits vs. performers (open question).** Standard guests pay a deposit then the balance. For performers with their own price, the default proposal is a single full payment with no deposit step, since the amounts are typically small. Confirm this with the hosts before building.
- **Getting status back into the database: automated via webhook.** One Astro API route (`/api/webhooks/stripe`, a handler within the same Worker) verifies the Stripe signature on `checkout.session.completed` and updates the guest's `payment_status`/`amount_paid_pence`/`payment_ref` server-side via the D1 binding, matched via `ticket_ref`/`client_reference_id`. Along with `/api/pay/[token]`, this is the only new code that needs secrets (`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, set via `wrangler secret put`), and it slots into infrastructure we already have — no new hosting platform. The admin page's guest table still shows payment status as a read-only reflection of this, with manual edit available as a fallback for one-off corrections.
- **Guest-facing change**: none of their link/token/ticket_ref changes. They revisit the same `/ticket/[token]` link and see their status progress (RSVP confirmed → Deposit paid → Paid in full), with the same QR now shown with a "paid" badge, and amounts shown as £. Performers see their own price; free performers see "nothing to pay" and no pay button.
- This is why the v2 columns (`amount_due_pence`, `amount_paid_pence`, `payment_ref`, `payment_status`, `is_performer`) are already in the schema — v2 is additive status/UI work, not a migration. Payment state lives in `payment_status`, never in `status`: `status` is rewritten on every RSVP submit, so a payment recorded there would be lost when a paid guest updates their answers.

## File/page changes

- **Migrate all existing pages** (`index`, `about`, `camping`, `food`, `activities`, `travel`, `faq`, `line-up`, `birthday-game`) into Astro pages under `src/pages/`, reusing their current copy/markup almost as-is. Replace the current `js/navigation.js` innerHTML-injection nav hack with a real Astro `<Layout>` + `<Nav>` component — while doing this, fix the existing bug where the nav links to `game.html` but the actual file is `birthday-game.html`.
- **`rsvp.html` → `src/pages/rsvp/[token].astro`**: server-loads the guest by token, renders the existing form fields (name read-only/prefilled, attendance, camping, vehicle, dietary, accessibility, arrival/departure day, contact email/phone, notes), posts to an Astro API route instead of Formspree, and swaps in a confirmation + QR on success. Update the existing "Data protection notice" copy to describe our own database instead of Formspree as the processor.
- **`ticket.html` → `src/pages/ticket/[token].astro`**: becomes the durable "your ticket" view — current status, QR, and (in v2) a pay button (none for free performers), replacing the "TBC"/"Paying — TBD" placeholders.
- **New**: `src/pages/api/rsvp.ts` (submit/update handler, triggers the confirmation email), `src/pages/admin/*` (guest list/edit/add/regenerate — no login page needed, Cloudflare Access handles that before the request arrives), `src/pages/api/admin/*` (guest CRUD), `src/pages/api/pay/[token].ts` and `src/pages/api/webhooks/stripe.ts` (v2), `src/lib/db.ts` (typed helpers over the D1 binding, accessed via `import { env } from "cloudflare:workers"`), `src/lib/email.ts` (Resend client + confirmation template), a small QR component.
- **Cloudflare config (`wrangler.jsonc`, not application code)**: a D1 database created and declared as the `DB` binding, its migration SQL applied via `wrangler d1 migrations apply`; a Cloudflare Access application covering `/admin/*` configured separately in the dashboard, with a policy listing the hosts' email addresses.
- **Env/secrets**: `RESEND_API_KEY`, `SITE_URL` (and later `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`) stored as Worker secrets (`wrangler secret put`), never committed. D1 needs no secret at all — access is via the binding declared in `wrangler.jsonc`, not an env var.

## Verification

- Local dev: `astro dev` against a local D1 database (`wrangler d1` supports a local/emulated mode), with `.env` set for Resend; manually walk through: seed a couple of test guests → visit `/rsvp/<token>` → submit → confirm the row updates in D1 and QR renders on `/ticket/<token>` → confirm a confirmation email arrives (use a real inbox or Resend's test mode) with the correct summary and ticket link → resubmit and confirm `ticket_ref` stays stable and a fresh confirmation email is sent.
- Confirm a submission still succeeds and saves correctly even if the email send is forced to fail (non-blocking check).
- Confirm an unknown/garbage token shows the "invalid link" state on both `/rsvp/[token]` and `/ticket/[token]`.
- Confirm a guest whose `token_expires_at` is in the past and who hasn't responded sees the "link expired" state on `/rsvp/[token]`; confirm a guest in the same state who *has* responded can still access `/rsvp/[token]` and `/ticket/[token]` normally.
- Confirm "Regenerate link" on the admin page issues a new token/expiry and that the old token immediately stops working.
- Confirm `/admin` is unreachable without a Cloudflare Access login (e.g. in an incognito window / signed out), and that a listed host's email successfully gets in via the one-time PIN flow.
- Confirm the admin page's view/edit/add flows work against real guest rows, including a guest with multiple inviters.
- Confirm a performer can only be marked (and priced) from the admin page, that a free performer's ticket shows "nothing to pay" and hides the RSVP form's Paying section, and that unticking "Performer" clears their price.
- Confirm the migrated static pages (nav, links, styling) still look and link correctly, including the `birthday-game.html` nav fix.
- Deploy with `wrangler deploy` to the `*.workers.dev` preview URL and repeat the same walkthrough against the deployed site before pointing the real domain at it.
