-- Performers use the same RSVP form as everyone else; being a performer is
-- set by hosts on the admin page only, never by the guest.
--
-- Performers can have their own ticket price, stored in the existing
-- amount_due_pence column:
--   null  → the standard ticket price (decided in v2)
--   0     → free: nothing to pay, so v2 skips the payment step
--   n > 0 → this performer's price, in pence
-- The app only sets amount_due_pence for performers; unticking "performer"
-- clears it back to null.

alter table guests add column is_performer integer not null default 0
  check (is_performer in (0, 1));
