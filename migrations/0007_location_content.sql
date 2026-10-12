-- Editable copy for the new /location page (src/pages/location.astro), plus
-- an editable label for the splash page's link to it. The photo and the
-- map embed stay in the template: they're not prose a host would rewrite.

insert into content_fields (page_slug, field_key, value, updated_at) values
  ('location', 'hero_eyebrow', 'Where it''s at', '2026-09-25T00:00:00.000Z'),
  ('location', 'hero_heading', 'Location', '2026-09-25T00:00:00.000Z'),
  ('location', 'hero_introduction', 'Over the Hill takes place at Out to Grass, a camping and events site in the countryside near Malvern.', '2026-09-25T00:00:00.000Z'),
  ('index', 'location_cta_label', 'Where is it?', '2026-09-25T00:00:00.000Z');

insert into content_blocks (id, page_slug, sort_order, variant, eyebrow, heading, body, created_at, updated_at) values
  ('location-site', 'location', 0, 'block', null, 'The site',
'Out to Grass is a camping, glamping and events site on Woodend Farm, set in open countryside. It''s where we''ll be camping, eating and partying for the whole weekend.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z'),

  ('location-address', 'location', 1, 'block', null, 'Address',
'Out to Grass, Woodend Farm, Cradley, Malvern, WR13 5JW

If you''re using a sat nav or maps app, enter the postcode WR13 5JW, or use the map below.', '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z');
