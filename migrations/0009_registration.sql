-- A guest's registration is complete once they've said yes AND either paid
-- their deposit or no deposit was due at the time (deposits closed, or a
-- free performer). Until then an attending guest's details are saved, but
-- they get no QR/ticket and are asked to pay the deposit to finish.
--
-- Stored rather than derived because it must stick: someone who registered
-- while deposits were closed keeps their ticket when deposits later open
-- (they're just asked to pay on their ticket page).
alter table guests add column registered_at text;

-- Everyone already attending registered under the old "yes = registered"
-- rule, so they keep their tickets.
update guests set registered_at = updated_at where attendance = 'yes';
