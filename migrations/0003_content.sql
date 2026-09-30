-- Editable site copy, so non-technical hosts can edit/copywrite text via
-- /admin/content without touching git or code. See src/lib/content.ts.
--
-- Two tables:
--   content_fields  short page-level strings (hero eyebrow/heading/intro,
--                   CTA labels, the homepage's bespoke fields).
--   content_blocks  the repeating <article class="content-block">/
--                   <aside class="notice"> sections — heading + body,
--                   reorderable/addable/deletable.
--
-- No content_pages table: the set of valid page slugs is a static registry
-- in src/lib/content.ts (CONTENT_PAGES), not DB-driven.
--
-- Body text is deliberately NOT markdown (no host on this team writes
-- markdown) — just two plain rules, applied by parseBody() in content.ts:
-- a blank line starts a new paragraph, and a run of lines each starting
-- with "- " becomes a bullet list.

create table content_fields (
  page_slug   text not null,
  field_key   text not null,
  value       text not null default '',
  updated_at  text not null,
  primary key (page_slug, field_key)
);

create table content_blocks (
  id          text primary key,             -- crypto.randomUUID() for rows created via the admin UI; this seed uses short readable literal ids instead, since there's no app code generating them here
  page_slug   text not null,
  sort_order  integer not null,
  variant     text not null default 'block' check (variant in ('block', 'notice')),
  eyebrow     text,
  heading     text,
  body        text not null default '',
  created_at  text not null,
  updated_at  text not null
);

create index content_blocks_page_slug_idx on content_blocks(page_slug, sort_order);

-- === Seed: today's real copy, moved out of the .astro files verbatim ===
-- (except: faq's notice block originally had two <h2>s under one eyebrow,
-- which doesn't fit "one heading per block" — the second heading's text is
-- folded into the body as a leading paragraph instead; and camping's
-- "Campervans and vehicles" block had an inline link to /travel mid-sentence,
-- which the plain-text body format has no syntax for, so it's flattened to
-- plain text — both noted again in the implementation report.)

-- index (splash homepage)
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('index', 'tagline', 'A weekend of dancing, partying and fannying about', '2026-09-25T00:00:00.000Z'),
  ('index', 'venue_line', 'Out to Grass, Woodend Farm, Cradley, WR13 5JW', '2026-09-25T00:00:00.000Z'),
  ('index', 'cta_label', 'RSVP now', '2026-09-25T00:00:00.000Z'),
  ('index', 'credits', 'Beth Adams
Andrew Conaboy
Bryony Lumb Morollon
Kirsty Buchan
Zubin Roy
Alex Ball
Alex Prior Crespo
Cameron Johnston
Emma Goss
James Jackson', '2026-09-25T00:00:00.000Z');

-- rsvp (the bare /rsvp page, shown when no link is remembered)
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('rsvp', 'hero_eyebrow', 'Be there or be square 🟦', '2026-09-25T00:00:00.000Z'),
  ('rsvp', 'hero_heading', 'RSVP', '2026-09-25T00:00:00.000Z'),
  ('rsvp', 'hero_introduction', 'RSVPs are by personal invite link, sent to you directly by one of the hosts (by email or WhatsApp) — there''s no public form to fill in here.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('rsvp-get-link', 'rsvp', 0, 'block', null, 'Get your link by email', 'If you know which email address your invite went to, enter it below and we''ll send your personal link there.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('rsvp-still-cant-find', 'rsvp', 1, 'block', null, 'Still can''t find it?', 'Check the email or WhatsApp message you got when you were invited. If you''ve genuinely lost it, or it''s stopped working, contact one of the hosts and they can send you a new one.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- about
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('about', 'hero_eyebrow', 'About', '2026-09-25T00:00:00.000Z'),
  ('about', 'hero_heading', 'Over the Hill', '2026-09-25T00:00:00.000Z'),
  ('about', 'hero_introduction', 'A weekend of friends, dancing, food, games and a lot of very questionable decisions.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('about-1', 'about', 0, 'block', null, null, 'We''re gathering for a relaxed long weekend in the countryside, with music, good food, campfire energy and plenty of time to sit around chatting and enjoying each other''s company.

The idea is simple: a beautiful place, a few lovely meals, some mischief, and a whole lot of laughter. Whether you''re staying for the whole weekend or just popping in for the day, we''d love you to be there.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- activities
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('activities', 'hero_eyebrow', 'Staying overnight', '2026-09-25T00:00:00.000Z'),
  ('activities', 'hero_heading', 'Fun activitieess', '2026-09-25T00:00:00.000Z'),
  ('activities', 'hero_introduction', 'Some fun stuff we will plan', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('activities-1', 'activities', 0, 'block', null, 'Spikeball?', 'I have a spikeball set. No try-hards

Art stuff

Yoga?

More stuff', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- camping
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('camping', 'hero_eyebrow', 'Staying overnight', '2026-09-25T00:00:00.000Z'),
  ('camping', 'hero_heading', 'Camping', '2026-09-25T00:00:00.000Z'),
  ('camping', 'hero_introduction', 'Everything you need to know about camping, facilities and what to bring for the weekend.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('camping-1', 'camping', 0, 'block', null, 'When you can arrive', 'The campsite will open at 3:00 pm on Friday. Please do not arrive earlier unless you have arranged this with one of the hosts.

Campers should leave by midday on Sunday.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('camping-2', 'camping', 1, 'block', null, 'What is available', '- Space for tents
- Toilets
- Drinking water
- Basic washing facilities
- Limited charging points', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('camping-3', 'camping', 2, 'block', null, 'What to bring', '- Your tent
- Sleeping bag and sleeping mat
- Warm and waterproof clothing
- A torch
- Reusable water bottle
- Any medication you may need', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('camping-4', 'camping', 3, 'block', null, 'Campervans and vehicles', 'Campervan spaces are limited. Please indicate on the RSVP form if you plan to bring one.

Cars cannot be parked directly beside tents. Parking information is available on the Travel page.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- food
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('food', 'hero_eyebrow', 'Food and drink', '2026-09-25T00:00:00.000Z'),
  ('food', 'hero_heading', 'Food', '2026-09-25T00:00:00.000Z'),
  ('food', 'hero_introduction', 'Information about meals, snacks and drinks available during the event.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('food-1', 'food', 0, 'block', null, 'Food plans', 'Food details are still TBC. We are putting the final arrangements in place and will confirm the details closer to the weekend.

At this stage, we can confirm that vegetarian and vegan options will be catered for, and we will make sure there is suitable food available for those dietary needs.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('food-2', 'food', 1, 'block', null, 'Meals and snacks', '- Meals: TBC
- Snacks: TBC
- Drinks: TBC
- Breakfast: TBC
- Vegetarian options: catered for
- Vegan options: catered for', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('food-3', 'food', 2, 'notice', 'Important', 'Dietary requirements', 'If you have any allergies or dietary needs beyond vegetarian and vegan, please let us know on the RSVP form so we can plan as well as possible.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('food-4', 'food', 3, 'block', null, 'Drinks and refreshments', 'Drink arrangements are currently TBC, but we will keep the bar and refreshments simple and practical for the weekend.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- travel (Google Maps link paragraph in the "Venue" block stays hardcoded in
-- the template, not stored here — see src/pages-disabled/travel.astro)
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('travel', 'hero_eyebrow', 'Getting there', '2026-09-25T00:00:00.000Z'),
  ('travel', 'hero_heading', 'Travel', '2026-09-25T00:00:00.000Z'),
  ('travel', 'hero_introduction', 'Directions, parking and rail links for the weekend at Out to Grass, Woodend Farm.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('travel-venue', 'travel', 0, 'block', null, 'Venue', 'Out to Grass, Woodend Farm, Cradley, Worcestershire, WR13 5JW.

The venue is in the Cradley area near Hagley and Stourbridge, in the West Midlands. If using a sat nav or maps app, enter the full postcode WR13 5JW for the best route.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('travel-car', 'travel', 1, 'block', null, 'By car', 'The easiest route is to drive to Cradley via the A456 and local roads around Hagley/Stourbridge. Please allow extra time for the last few minutes of the journey as the final approach is on smaller country roads.

Follow the signs for the event when you get close to Cradley and look out for the parking and arrival instructions on the day. We''ll update this and send emails about the parking situation.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('travel-train', 'travel', 2, 'block', null, 'By train', 'The nearest rail stations are generally Stourbridge Junction and Hagley, with Kidderminster also a practical option depending on your starting point.

We''re going to organise a shuttle bus from Stourbridge Junction to the venue for those arriving by train. More details will be shared closer to the date.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('travel-bus', 'travel', 3, 'block', null, 'By bus', 'For people who can''t make the shuttle bus, let us know in the RSVP form and we''ll organise taxis with other people.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('travel-late', 'travel', 4, 'block', null, 'Arriving late', 'If your plans change and you expect to arrive after dark, please let one of the hosts know in advance so that we can direct you to the right entrance and parking area.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- faq (notice block's second <h2> "Further notices" folded into body as a
-- leading paragraph, since content_blocks has one heading per row)
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('faq', 'hero_eyebrow', 'Frequently asked questions', '2026-09-25T00:00:00.000Z'),
  ('faq', 'hero_heading', 'FAQs', '2026-09-25T00:00:00.000Z'),
  ('faq', 'hero_introduction', 'Everything you need to know about camping, facilities and what to bring for the weekend.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('faq-1', 'faq', 0, 'block', null, 'When you can arrive', 'The campsite will open at 3:00 pm on Friday. Please do not arrive earlier unless you have arranged this with one of the hosts.

Campers should leave by midday on Sunday.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('faq-2', 'faq', 1, 'block', null, 'What is available', '- Space for tents
- Toilets
- Drinking water
- Basic washing facilities
- Limited charging points', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('faq-3', 'faq', 2, 'block', null, 'What to bring', '- Your tent
- Sleeping bag and sleeping mat
- Warm and waterproof clothing
- A torch
- Reusable water bottle
- Any medication you may need', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('faq-notice', 'faq', 3, 'notice', 'Please note:', 'We''ll remind everyone what the weather forecast is near the time', 'Further notices

Even if the forecast looks good, bring warm layers and waterproof clothing. Conditions may change quickly.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('faq-4', 'faq', 4, 'block', null, 'Campervans and vehicles', 'Campervans?

Cars?

Bringing you own booze, not allowed, right? wee bit?

Meals?', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- line-up (orphan page, titled "Ticket | Over the Hill" in its Layout props)
insert into content_fields (page_slug, field_key, value, updated_at) values
  ('line-up', 'hero_eyebrow', 'Tickets', '2026-09-25T00:00:00.000Z'),
  ('line-up', 'hero_heading', 'Tickets', '2026-09-25T00:00:00.000Z'),
  ('line-up', 'hero_introduction', 'Everything you need to know about tickets, paying and what to is included in your ticket.', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('lineup-1', 'line-up', 0, 'block', null, 'Ticket options', 'TBC', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('lineup-2', 'line-up', 1, 'block', null, 'Paying', 'I guess once when people RSVP we can send them a link to pay for their tickets. Or maybe we can just have a paypal link on this page. TBD', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),
  ('lineup-3', 'line-up', 2, 'block', null, 'What is included in your ticket', '- TBC', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');

-- D1 has no public network endpoint at all — same access-control note as
-- migrations/0001_init.sql: these tables are reachable only via the Worker's
-- binding, from our own server-side code (src/lib/content.ts).
