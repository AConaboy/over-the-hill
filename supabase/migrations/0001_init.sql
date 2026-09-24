-- Over the Hill: sign-up/ticketing v1 schema.
-- Matches docs/signup-ticketing-spec.md's "Data model" section on the
-- spec/signup-ticketing branch.

create table guests (
  id                uuid primary key default gen_random_uuid(),
  token             text unique not null default gen_random_uuid()::text,  -- guest's link credential
  token_expires_at  timestamptz not null default (now() + interval '30 days'),
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

  confirmation_email_sent_at timestamptz,        -- last time we successfully emailed them

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

create index guest_inviters_guest_id_idx on guest_inviters(guest_id);
create index guest_inviters_inviter_name_idx on guest_inviters(inviter_name);

-- Row Level Security is enabled with no policies: the anon/authenticated
-- roles get no access at all via Supabase's auto-generated REST API. Every
-- read/write in this app goes through server-side code (src/lib/guests.ts)
-- using the service role key, which bypasses RLS. This is defense-in-depth,
-- not the primary access control — the app's own token-lookup logic is.
alter table guests enable row level security;
alter table guest_inviters enable row level security;
