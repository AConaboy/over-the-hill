-- When a host last sent (or marked as sent) a guest's invite: copying the
-- invite message from admin, or ticking "sent" for one sent another way.
-- null = not sent yet.
alter table guests add column invite_sent_at text;
