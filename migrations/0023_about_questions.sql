-- The About page becomes an invitation (a wide box) followed by the
-- questions guests keep asking, one box each, two to a row on wide screens
-- (see about.astro). The "Got an act or an idea?" notice stays, at the end.
-- Uses the "### " subheadings, [text](/link) links and **highlights** that
-- page text now understands (parseBody, inlineParts).

delete from content_blocks where page_slug = 'about' and id <> 'about-ideas';

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('about-intro', 'about', 0, 'block', null, null, 'You are cordially invited to **Over the Hill**, a party in the woods to celebrate your favourite people reaching their 30th year. If you''re reading this, you''re one of the beautiful 300 people we''d love to share this weekend with, and you mean a lot to us.

Come join us from the **13th to the 15th of August 2027** for two days of dancing, partying and fannying about. The theme is Woodland Fantasy, so get ready for a weekend fit for a goblin king.

Whether you''re a dainty woodland fairy or a dirty rave goblin, we''ve got something for you. Expect morning runs, yoga and games alongside live music, DJs and silent disco late into the night. Wholesome fun, noughties bangers and shenanigans to be expected.

Still got questions? See below for all the important stuff.', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-schedule', 'about', 1, 'block', null, 'Schedule for the weekend?', 'We''re working on it! Details to come, but for now the weekend will look something like...

### Friday

Arrival day! After everyone is settled in, we''ll be treating our esteemed guests to a forest banquet before ceilidhing into the night. And, for the intellectuals amongst us, the celestial druid of Glasgowria will be on hand to guide you around the celestial sphere.

### Saturday

This is the big day, with (optional) woodland fantasy fancy dress! Expect organised fun, live music, DJs and a whole lot of freaky woodland magic.', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-where', 'about', 2, 'block', null, 'Where is it?', 'Out to Grass in Malvern, Worcestershire: a venue purpose-built for music, art and camping. It''s got everything a good festival needs: showers, stages, a bar, food, sound engineers and working bogs. So if you were imagining a Fyre Festival situation, think again.

See for yourself [here](/location).', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-travel', 'about', 3, 'block', null, 'How do I get there?', 'There''s plenty of space for car parking, and we''ll help organise carpooling closer to the time.

The closest train station is Malvern Link, and there''s a direct train from Paddington. From there it''s a 15-minute taxi.

We may be able to offer some lifts from the station to the venue. Watch this space!', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-price', 'about', 4, 'block', null, 'How much is a ticket?', 'Tickets will be no more than £100, and we''re working hard behind the scenes to keep the price as low as possible while still providing a genuinely amazing and unforgettable weekend.

This is also why it''s super important that you RSVP: it''s helping us work out ticket prices! The more people coming, the cheaper it gets...', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-includes', 'about', 5, 'block', null, 'What does a ticket get you?', 'As well as entrance to the festival, your ticket covers:

- Two nights of camping
- The Friday welcome meal and drinks
- A few more free drinks across the weekend!', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z'),
  ('about-buying', 'about', 6, 'block', null, 'When can I buy a ticket?', 'Tickets will be on sale early in 2027. Once you''ve RSVP''d yes, we''ll email you when they''re available.', '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z');

update content_blocks set sort_order = 7, updated_at = '2026-11-27T00:00:00.000Z' where id = 'about-ideas';
