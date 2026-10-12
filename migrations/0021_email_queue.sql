-- Emails Resend couldn't take yet (its daily limit on the free plan is
-- 100), kept exactly as they'd have gone out and sent in order once it
-- takes them again: hourly (src/worker.ts), or from admin Emails. A row
-- goes once it's sent. See src/lib/emailQueue.ts.
create table email_queue (
  id               text primary key,
  guest_id         text references guests(id) on delete cascade,
  to_address       text not null,
  subject          text not null,
  html             text not null,
  text             text not null,
  created_at       text not null,
  attempts         integer not null default 0,
  last_error       text,
  last_attempt_at  text
);

create index email_queue_by_age on email_queue (created_at);
