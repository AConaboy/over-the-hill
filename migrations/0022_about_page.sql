-- The About page goes live (/about, in the main navigation) with the hosts'
-- own words, replacing the placeholder text seeded in 0003: two parts of a
-- letter (side by side on wide screens; see about.astro) and a note asking
-- for acts and ideas.

insert into content_fields (page_slug, field_key, value, updated_at) values
  ('about', 'hero_eyebrow', 'Who, what and why', '2026-11-26T00:00:00.000Z'),
  ('about', 'hero_heading', 'About', '2026-11-26T00:00:00.000Z'),
  ('about', 'hero_introduction', 'We''re all turning 30, and instead of having parties ourselves we decided: why not try the ridiculous plan of throwing our very own music festival instead!', '2026-11-26T00:00:00.000Z'),
  ('about', 'photo_alt', 'Out to Grass at dusk: a lit-up dome, bell tents and festoon lights on a grassy hillside', '2026-11-26T00:00:00.000Z'),
  ('about', 'cta_label', 'Complete your RSVP', '2026-11-26T00:00:00.000Z'),
  ('about', 'location_cta_label', 'Where is it?', '2026-11-26T00:00:00.000Z'),
  ('about', 'meta_description', 'Why we''re throwing our own music festival for our 30th birthdays, and what the weekend at Out to Grass will be like.', '2026-11-26T00:00:00.000Z')
on conflict (page_slug, field_key) do update set value = excluded.value, updated_at = excluded.updated_at;

delete from content_blocks where page_slug = 'about';

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('about-weekend', 'about', 0, 'block', null, 'The weekend', 'So join us at Over the Hill from the 13th to the 15th of August 2027 to take part in the most unique of ventures. We''ve hired the venue, sorted the muscle and sharpened the chef''s knives. Now we just need you...

Our venue, Out to Grass, is incredible: a purpose-made place for music, art and camping. Your ticket includes two nights'' camping, some food and drink, brilliant musical acts, and daytime events like sports day, blind date and arts and crafts, to name a few.

On Friday we''ll have our welcome ceremony, where we''ll feast together before a ceilidh and then dancing into the night. We even have our own resident astronomer to take you on a stargazing tour!', '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('about-why', 'about', 1, 'block', null, 'Why we''re doing it', 'Each of us hosts has put in a sizeable fee to keep costs down, and we''re not making any money. We aim to keep tickets around £80. If you''re reading this, you''re one of the beautiful 300 people we''d love to share this weekend with, and you mean a lot to us.

People keep asking what this weekend is. We want it to be many things for many people: partying late into the night, quiet yoga and meditation, morning runs, scavenger hunts, DJ battles and musical talent from across the UK.

Over the Hill is a place for you: safe, friendly, inclusive and loving, to make new friends and new memories, with magic in every blade of grass.

Love, the Organising Committee', '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('about-ideas', 'about', 2, 'notice', 'Got an act or an idea?', null, 'We''d love to know about it, so please get in touch: message any of us, or find us on Instagram at @overthehill_fest.', '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z');
