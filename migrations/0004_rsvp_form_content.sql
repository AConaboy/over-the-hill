-- Extends the content-editing system (migrations/0003_content.sql) to the
-- RSVP token page's surrounding copy — hero + the informational content
-- blocks around the form. Deliberately excludes the actual <form> (field
-- labels/inputs) and the post-submit confirmation message: both are tied
-- directly to the data model and submission logic in src/pages/api/rsvp.ts,
-- not prose a host should freely rewrite.
--
-- New slug "rsvp-form", distinct from the existing "rsvp" slug (which is
-- the separate /rsvp "no link found" landing page).

insert into content_fields (page_slug, field_key, value, updated_at) values
  ('rsvp-form', 'hero_eyebrow', 'Be there or be square 🟦', '2026-09-25T00:00:00.000Z'),
  ('rsvp-form', 'hero_heading', 'RSVP', '2026-09-25T00:00:00.000Z'),
  ('rsvp-form', 'hero_introduction', 'Please complete the form so that we know who is coming, who is camping and whether you have any dietary or accessibility requirements.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('rsvp-form-deadline', 'rsvp-form', 0, 'block', null, 'Please RSVP by 1 May 2027',
'We''re collecting attendance, camping arrangements, dietary requirements and accessibility needs so we can plan the weekend properly.

A wee statement on the data collection is at the end for the very privacy-conscious 🙂', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),

  ('rsvp-form-changing', 'rsvp-form', 1, 'block', null, 'Changing your response',
'If your plans change after submitting the form, complete it again or contact one of the hosts. We''ll use your most recent response to plan the event.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),

  ('rsvp-form-paying', 'rsvp-form', 2, 'block', null, 'Paying',
'No payment is needed at this stage — RSVPs are free. If we introduce a deposit or ticket price later, we''ll let you know on your ticket page.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),

  ('rsvp-form-questions', 'rsvp-form', 3, 'block', null, 'Questions?',
'Contact one of the hosts if you are unsure about camping, food, travel or anything else before submitting your response.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),

  ('rsvp-form-privacy', 'rsvp-form', 4, 'block', null, 'Data protection notice',
'We collect your name, email address, and the information you provide about attendance, camping, dietary needs, accessibility requirements, and activities so that we can plan the event and make appropriate arrangements for you.

We will process this information for the purpose of organising the event, fulfilling your RSVP, and making reasonable adjustments where needed. We will only keep it for as long as necessary to manage the event and will then delete it unless we are required to retain it for a lawful reason.

The information may be shared only with the event hosts and any service providers necessary to organise the event, such as our database and email providers. We will not use your data for marketing or any unrelated purpose.

You have the right to ask for access to, correction of, or deletion of your personal data, and to withdraw your consent at any time by contacting Andrew or another host. By submitting this form, you confirm that you understand how your information will be used and that you consent to this processing.

The data in this form is stored in our own database, hosted on Cloudflare, and confirmation emails are sent via Resend, our email provider.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');
