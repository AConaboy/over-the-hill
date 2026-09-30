-- Payment state gets its own column instead of sharing `status` with the
-- RSVP lifecycle. With one column, a guest who'd paid a deposit and then
-- resubmitted their RSVP (e.g. to update dietary needs) would have
-- 'deposit_paid' overwritten with 'rsvp_yes'.
--
-- From here on, `status` only tracks invited → viewed → rsvp_yes/rsvp_no
-- (plus 'cancelled'), and payment lives in `payment_status`. The old
-- 'deposit_paid'/'paid_full' values stay in guests.status's CHECK
-- constraint only because SQLite can't alter a CHECK without rebuilding the
-- table (which would cascade-delete guest_inviters). Nothing writes them.

alter table guests add column payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'deposit_paid', 'paid_full'));
