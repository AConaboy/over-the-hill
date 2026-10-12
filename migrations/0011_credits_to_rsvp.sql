-- "Brought to you by" (the hosts) moves from the homepage to each guest's
-- own RSVP page, so its names move from the "index" page's fields to the
-- "rsvp-form" page's. Copies whatever's there now (the hosts' own edits
-- included), unless the RSVP page already has its own.

insert into content_fields (page_slug, field_key, value, updated_at)
select 'rsvp-form', 'credits', value, updated_at
from content_fields
where page_slug = 'index' and field_key = 'credits'
on conflict do nothing;

delete from content_fields where page_slug = 'index' and field_key = 'credits';
