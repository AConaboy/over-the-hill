-- A guest's history: what happened and who did it (a host's email from
-- Cloudflare Access, "guest", or "Stripe"). Shown on their admin page.
create table guest_events (
  id        text primary key,
  guest_id  text not null references guests(id) on delete cascade,
  at        text not null,
  actor     text not null,
  action    text not null,
  detail    text
);

create index guest_events_by_guest on guest_events (guest_id, at);
