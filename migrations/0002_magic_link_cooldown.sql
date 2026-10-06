-- Tracks the last time we emailed a guest their invite link via the
-- "find my link" self-service form, so repeated submissions for the same
-- email can't be used to spam a guest's inbox.

alter table guests add column magic_link_sent_at text;
