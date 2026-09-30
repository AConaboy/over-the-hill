-- The RSVP page is now each guest's one page (the ticket page merged into
-- it), and once they've replied they change their answers with an "Edit
-- your response" button. Two of its seeded paragraphs no longer fit:
-- "Changing your response" said to complete the form again, and "Paying"
-- said RSVPs are free. Each is only replaced if it still reads exactly as
-- seeded (migrations/0004_rsvp_form_content.sql), so a host's own edits
-- are left alone.

update content_blocks
set body = 'You can change your answers any time: open this page again (from your link, or RSVP on the homepage on this device) and press Edit your response. We''ll use your latest answers to plan the event.',
    updated_at = '2026-09-26T00:00:00.000Z'
where id = 'rsvp-form-changing'
  and body = 'If your plans change after submitting the form, complete it again or contact one of the hosts. We''ll use your most recent response to plan the event.';

update content_blocks
set body = 'If there''s a deposit or ticket price, it''ll show on this page once you''ve replied, with a button to pay.',
    updated_at = '2026-09-26T00:00:00.000Z'
where id = 'rsvp-form-paying'
  and body = 'No payment is needed at this stage — RSVPs are free. If we introduce a deposit or ticket price later, we''ll let you know on your ticket page.';
