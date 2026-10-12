-- Over the Hill: sign-up/ticketing v1 schema (Cloudflare D1 / SQLite).
-- Matches docs/signup-ticketing-spec.md's "Data model (Cloudflare D1, two
-- tables)" section on the spec/signup-ticketing branch.
--
-- Unlike Postgres, SQLite has no uuid type, gen_random_uuid(), timestamptz,
-- or interval defaults — ids/tokens/timestamps are generated in application
-- code (src/lib/guests.ts) and passed in explicitly on every insert/update.

create table guests (
  id                text primary key,            -- crypto.randomUUID(), set by app on insert
  token             text unique not null,        -- crypto.randomUUID(), guest's link credential
  token_expires_at  text not null,                -- ISO 8601; app sets to now + 30 days
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
                      'deposit_paid','paid_full','cancelled'   -- v2 values, unused in v1
                    )),

  -- v2 fields, present now so v2 needs zero migration. All amounts are
  -- GBP, stored as pence (integer) to avoid floating-point rounding:
  amount_due_pence  integer,
  amount_paid_pence integer default 0,
  payment_ref       text,                        -- Stripe client_reference_id / payment intent id

  checked_in_at     text,                          -- ISO 8601; future door check-in

  confirmation_email_sent_at text,                -- ISO 8601; last time we successfully emailed them

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

create index guest_inviters_guest_id_idx on guest_inviters(guest_id);
create index guest_inviters_inviter_name_idx on guest_inviters(inviter_name);

-- D1 has no public network endpoint at all — it's reachable only via the
-- binding configured on the Worker, so only our own server-side code
-- (src/lib/guests.ts, via src/lib/db.ts) can ever query it. There's no
-- separate access-control layer to configure here (no RLS equivalent),
-- unlike a hosted-Postgres setup: the app's own token-lookup logic is the
-- entire access boundary.
