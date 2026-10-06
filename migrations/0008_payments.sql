-- v2 payments (see docs/signup-ticketing-spec.md, "v2: deposit / payment
-- flow"). Additive only: CI applies migrations before deploying new code.

-- Host-editable payment settings (admin Payments page). Keys:
--   deposit_pence, standard_price_pence  integer pence stored as text; a
--                                        key is deleted (not blanked) when
--                                        unset, since the final price isn't
--                                        known until after deposits open
--   deposits_open, balance_open          '1' / '0'
create table settings (
  key         text primary key,
  value       text not null,
  updated_at  text not null
);

insert into settings (key, value, updated_at) values
  ('deposits_open', '0', '2026-09-25T00:00:00.000Z'),
  ('balance_open', '0', '2026-09-25T00:00:00.000Z');

-- Append-only ledger. guests.amount_paid_pence is always recomputed as the
-- sum of these rows, so it can't drift. id is the Stripe Checkout Session
-- id for card payments, which makes a repeated webhook delivery a no-op
-- (insert ... on conflict do nothing); manual rows get a UUID. Refunds are
-- recorded by hosts after refunding in Stripe, as negative amounts.
create table payments (
  id            text primary key,
  guest_id      text not null references guests(id) on delete cascade,
  kind          text not null check (kind in ('deposit', 'balance', 'manual', 'refund')),
  amount_pence  integer not null,
  stripe_ref    text,                -- payment intent id, or a Stripe refund id noted by a host
  note          text,
  created_at    text not null
);

create index payments_guest_id_idx on payments(guest_id);

-- The guest's single open Stripe checkout, if any. The pay route only
-- creates a new session when it can atomically claim these columns, so two
-- tabs or double clicks can never produce two payable checkouts.
alter table guests add column checkout_session_id text;
alter table guests add column checkout_session_url text;
alter table guests add column checkout_amount_pence integer;
alter table guests add column checkout_expires_at text;
