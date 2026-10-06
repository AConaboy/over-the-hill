-- The data protection notice moves from the bottom of the RSVP form to its
-- own page, /privacy (linked from the form and the site footer). The block
-- keeps its id and any host edits; it just changes page.

insert into content_fields (page_slug, field_key, value, updated_at) values
  ('privacy', 'hero_eyebrow', 'For the very privacy-conscious', '2026-10-06T00:00:00.000Z'),
  ('privacy', 'hero_heading', 'Your data', '2026-10-06T00:00:00.000Z'),
  ('privacy', 'hero_introduction', 'What we collect when you RSVP, why, and who sees it.', '2026-10-06T00:00:00.000Z')
on conflict do nothing;

update content_blocks
set page_slug = 'privacy', sort_order = 0, updated_at = '2026-10-06T00:00:00.000Z'
where id = 'rsvp-form-privacy';

-- Bring the seeded wording up to date with what the form now asks
-- (phone, days, vehicles, lifts, glamping; no activities) and with card
-- payments. Each replace() only changes the text if it's still as seeded.
update content_blocks
set body = replace(
      replace(
        replace(
          replace(body,
            'the information you provide about attendance, camping, dietary needs, accessibility requirements, and activities',
            'phone number, and the information you provide about attendance, travel (arrival and departure days, vehicles and lift sharing), camping and glamping, dietary needs and accessibility requirements'),
          'such as our database and email providers',
          'such as our database, email and payment providers'),
        'By submitting this form,',
        'By sending your RSVP,'),
      'confirmation emails are sent via Resend, our email provider.',
      'confirmation emails are sent via Resend, our email provider. Payments are taken by Stripe, so we never see or store your card details.')
where id = 'rsvp-form-privacy';

-- The RSVP page's opening block pointed to the notice "at the end".
update content_blocks
set body = replace(body,
      'A wee statement on the data collection is at the end for the very privacy-conscious 🙂',
      'A wee statement on how we use your data is linked at the bottom of the form, for the very privacy-conscious 🙂'),
    updated_at = '2026-10-06T00:00:00.000Z'
where id = 'rsvp-form-deadline';
