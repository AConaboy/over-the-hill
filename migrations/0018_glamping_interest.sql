-- Glamping pods: there are only a few and no price yet, so guests can only
-- say they're interested (or might be). It doesn't reserve a pod; hosts
-- follow up. null = no thanks / not said.
alter table guests add column glamping text check (glamping in ('interested', 'maybe'));
