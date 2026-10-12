-- The "Please RSVP by …" heading shows the day each guest's own link
-- expires ({date}, filled in on their page) rather than one fixed date.
-- Only replaced if it still reads as seeded (migrations/0004), so a host's
-- own wording is left alone.
update content_blocks
set heading = 'Please RSVP by {date}',
    updated_at = '2026-10-06T00:00:00.000Z'
where id = 'rsvp-form-deadline'
  and heading = 'Please RSVP by 1 May 2027';

-- The "Paying" paragraph above the RSVP form is now written by the page
-- itself, from the payment settings (nothing to pay yet / a deposit / the
-- whole price), so it always matches what happens when they reply. The
-- editable block it replaces goes.
delete from content_blocks where id = 'rsvp-form-paying';
