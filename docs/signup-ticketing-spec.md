# Sign-up / Ticketing Spec

## Context

The site currently lives as hand-written static HTML pages (no build step, no backend). RSVP is a plain form posting to Formspree, and `ticket.html` is a stub with a "Paying — TBD" note left as a placeholder. We have a spreadsheet of invited guests and who invited them, and want to move to per-guest, protected sign-up links, store responses in a real database (not just Formspree emails), show guests a confirmation/ticket (QR) on sign-up, and eventually collect a deposit and convert sign-ups into paid tickets — without having to re-architect when that day comes.

This spec migrates the whole site to a small framework rather than bolting a database onto raw HTML, since we're not attached to the current stack.

## Architecture

- **Framework: Astro.** The site is almost entirely static content (about/camping/food/activities/travel/faq/line-up/game) with only two pages needing real interactivity (RSVP, ticket). Astro components are close to plain HTML/CSS, so migrating the existing pages is near copy-paste, and only the RSVP/ticket/admin pages need client-side JS ("islands"). This avoids the overhead of converting every page into React (which a full Next.js migration would require) while still giving us npm, a build step, server endpoints, and typed data.
- **Hosting: Cloudflare Pages**, using the official `@astrojs/cloudflare` SSR adapter. Astro pages render on Cloudflare's edge; API routes become Pages Functions. This meets all our needs (server-side secrets, dynamic routes, a webhook target for v2).
- **Database: Supabase** (hosted Postgres). Accessed **only from server-side Astro code** (page server code / API routes running as Pages Functions) using the Supabase **service role key**, stored as a Cloudflare Pages secret — it never reaches the browser. The server is the trust boundary: it only ever looks up a guest by the token supplied in the URL, never lists all guests to unauthenticated callers. Row Level Security is still enabled on the tables as defense-in-depth, but the app's own logic is the primary access control.
- **Guest links use a path segment**, e.g. `https://overthehill.xyz/rsvp/<token>`, not a query string — idiomatic for Astro dynamic routes (`src/pages/rsvp/[token].astro`) and easy to hand out as a single copy-pasteable link.

## Data model (Supabase, two tables)

One `guests` row per invite (no plus-ones, so no attendee join table needed for that). `invited_by` is a **separate join table** since a guest can be invited by more than one person.

```sql
create table guests (
  id                uuid primary key default gen_random_uuid(),
  token             text unique not null default gen_random_uuid()::text,  -- guest's link credential
  ticket_ref        text unique,                -- short code, set once attendance = 'yes'

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
                      'deposit_paid','paid_full','cancelled'   -- v2 values, unused in v1
                    )),

  -- v2 fields, present now so v2 needs zero migration. All amounts are
  -- GBP, stored as pence (integer) to avoid floating-point rounding:
  amount_due_pence  integer,
  amount_paid_pence integer default 0,
  payment_ref       text,                        -- Stripe client_reference_id / payment intent id

  checked_in_at     timestamptz,                 -- future door check-in

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- a guest can be invited by more than one person, and an inviter isn't
-- necessarily another guest row, so this is a simple free-text join table
create table guest_inviters (
  id            uuid primary key default gen_random_uuid(),
  guest_id      uuid not null references guests(id) on delete cascade,
  inviter_name  text not null,
  unique (guest_id, inviter_name)
);
```

## Security model for unique links

- Token = `gen_random_uuid()` per row — unguessable, no separate shared password needed. A shared passphrase would add friction without real protection in a friend group (people forward passphrases as casually as links), while the per-guest token already fully isolates one guest's data from another's.
- Guest-facing routes never expose a "list all guests" capability. `/rsvp/[token]` and `/ticket/[token]` each do a single lookup by token server-side.
- Invalid/unknown token → friendly "this link isn't valid, contact the hosts" page, not an error page.
- Resubmitting the RSVP form is allowed (matches the existing site copy: "if your plans change, complete it again") — it updates the row in place and does not regenerate `ticket_ref`, so a guest's QR code stays stable across edits.

## v1 process flow (no payment)

1. **Import**: the existing spreadsheet (name + who invited them, plus email/phone if available) is imported into `guests` + `guest_inviters` — either via the admin page's "add guest" flow (below) or a one-off script for the initial bulk load, since a guest can have more than one inviter.
2. **Generate links**: the admin page lists every guest's `https://overthehill.xyz/rsvp/<token>` link for copying (also obtainable via one SQL query directly in Supabase if preferred).
3. **Distribute manually**: hosts copy each guest's personal link into email/WhatsApp themselves (no automated sending in v1).
4. **Guest opens their link** → `/rsvp/[token]` fetches their row server-side, pre-fills any previously-submitted answers.
5. **Guest submits** the form (attendance yes/no, dietary & allergies, contact email/phone, arrival/departure day, camping/accommodation) → an Astro API route validates the token again and writes the update.
6. **On success with attendance = yes**: page shows a confirmation plus a QR code (see below). On attendance = no: simple acknowledgement, no QR.
7. **Guest can revisit `/ticket/[token]`** any time to see their current status and QR again.
8. **Hosts view, edit, and add guests** via the admin page (below) — in scope for v1.

## Admin page (v1 scope)

- **Route**: `/admin`, gated by a single shared password (Cloudflare Pages env secret, checked server-side, session via an HttpOnly cookie) — proportionate for a small group of hosts; can be upgraded to per-host accounts later if needed.
- **View**: table of all guests — name, inviter(s), attendance/status, contact info, camping/dietary/accessibility details, payment status — sortable/filterable, with each guest's `/rsvp/<token>` link shown for copying.
- **Edit**: a host can correct any guest's details directly (e.g. fixing a typo'd email, adjusting attendance if told verbally) — writes through the same server-side Supabase access as the guest-facing routes.
- **Add**: a form to add a new guest (name + one or more inviters + optional email/phone), which generates their `token` and surfaces their new personal link immediately — becomes the ongoing way to extend the invite list beyond the initial import.

## QR / ticket display

- QR encodes a URL built from `ticket_ref` (a short code, distinct from the long-lived `token`), e.g. `https://overthehill.xyz/checkin/<ticket_ref>` — not the token itself, since the token is an edit credential and the QR may be shown to someone else at the gate.
- Generated with the `qrcode` npm package inside a small Astro island component (client or server-rendered SVG — either works now that we have a build step).
- v1 purpose: a lightweight "you're on the list" confirmation shown on screen (guest can screenshot it — no email delivery needed for v1).
- v2 purpose (no new QR issued): becomes the door check-in scan target (`checked_in_at` column already exists) and the same code a guest's ticket shows as "paid" once a deposit/payment lands — the guest's link and QR never change, only their status does.

## v2: deposit / payment flow

- **Currency: GBP throughout.** Stripe Payment Links are created in GBP, and the `amount_due_pence`/`amount_paid_pence` columns store whole pence (e.g. £15.00 deposit = `1500`) to avoid floating-point rounding issues.
- **Mechanism: Stripe Payment Links**, one per price point (deposit vs. full balance) created in Stripe's dashboard — no custom checkout code. Each guest's payment link includes `?client_reference_id=<ticket_ref>` so a payment can always be traced back to a specific guest.
- **Getting status back into the database: automated via webhook.** One Astro API route (`/api/webhooks/stripe`, runs as a Cloudflare Pages Function) verifies the Stripe signature and updates the guest's `status`/`amount_paid_pence`/`payment_ref` using the service role key server-side, matched via `ticket_ref`/`client_reference_id`. This is the only place v2 needs a true secret (`STRIPE_WEBHOOK_SECRET`), and it slots into infrastructure we already have (Cloudflare Pages Functions) — no new hosting platform. The admin page's guest table still shows payment status as a read-only reflection of this, with manual edit available as a fallback for one-off corrections.
- **Guest-facing change**: none of their link/token/ticket_ref changes. They revisit the same `/ticket/[token]` link and see their status progress (RSVP confirmed → Deposit paid → Paid in full), with the same QR now shown with a "paid" badge, and amounts shown as £.
- This is why the v2 columns (`amount_due_pence`, `amount_paid_pence`, `payment_ref`, and the extra `status` values) are already in the v1 schema — v2 is additive status/UI work, not a migration.

## File/page changes

- **Migrate all existing pages** (`index`, `about`, `camping`, `food`, `activities`, `travel`, `faq`, `line-up`, `birthday-game`) into Astro pages under `src/pages/`, reusing their current copy/markup almost as-is. Replace the current `js/navigation.js` innerHTML-injection nav hack with a real Astro `<Layout>` + `<Nav>` component — while doing this, fix the existing bug where the nav links to `game.html` but the actual file is `birthday-game.html`.
- **`rsvp.html` → `src/pages/rsvp/[token].astro`**: server-loads the guest by token, renders the existing form fields (name read-only/prefilled, attendance, camping, vehicle, dietary, accessibility, arrival/departure day, contact email/phone, notes), posts to an Astro API route instead of Formspree, and swaps in a confirmation + QR on success. Update the existing "Data protection notice" copy to describe Supabase instead of Formspree as the processor.
- **`ticket.html` → `src/pages/ticket/[token].astro`**: becomes the durable "your ticket" view — current status, QR, and (in v2) the relevant Payment Link button, replacing the "TBC"/"Paying — TBD" placeholders.
- **New**: `src/pages/api/rsvp.ts` (submit/update handler), `src/pages/admin/*` (login + guest list/edit/add), `src/pages/api/admin/*` (guest CRUD, auth-checked), `src/pages/api/webhooks/stripe.ts` (v2), `src/lib/supabase.ts` (server-side client using the service role key from env), a small QR component.
- **Env/secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` (and later `STRIPE_WEBHOOK_SECRET`) stored as Cloudflare Pages secrets, never committed.

## Verification

- Local dev: `astro dev` with a `.env` pointing at a Supabase project; manually walk through: seed a couple of test guests → visit `/rsvp/<token>` → submit → confirm row updates in Supabase and QR renders on `/ticket/<token>` → resubmit and confirm `ticket_ref` stays stable.
- Confirm an unknown/garbage token shows the "invalid link" state on both `/rsvp/[token]` and `/ticket/[token]`.
- Confirm the admin page's view/edit/add flows work against real guest rows, including a guest with multiple inviters.
- Confirm the migrated static pages (nav, links, styling) still look and link correctly, including the `birthday-game.html` nav fix.
- Deploy to a Cloudflare Pages preview environment and repeat the same walkthrough against the deployed site before pointing the real domain at it.
