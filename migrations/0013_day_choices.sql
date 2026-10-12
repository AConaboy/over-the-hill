-- Arrival and departure days become a fixed set of choices (thu, fri, sat,
-- sun, mon, unsure) instead of free text, so they can be counted. Old free
-- text that clearly names a day is converted; anything else is cleared
-- (nothing's live yet). The allowed values are enforced by the app, as
-- adding a CHECK to an existing column would mean rebuilding the table.
update guests set arrival_day = case
    when lower(trim(arrival_day)) like 'thu%' then 'thu'
    when lower(trim(arrival_day)) like 'fri%' then 'fri'
    when lower(trim(arrival_day)) like 'sat%' then 'sat'
    when lower(trim(arrival_day)) like 'sun%' then 'sun'
    when lower(trim(arrival_day)) like 'mon%' then 'mon'
    else null
  end
where arrival_day is not null;

update guests set departure_day = case
    when lower(trim(departure_day)) like 'thu%' then 'thu'
    when lower(trim(departure_day)) like 'fri%' then 'fri'
    when lower(trim(departure_day)) like 'sat%' then 'sat'
    when lower(trim(departure_day)) like 'sun%' then 'sun'
    when lower(trim(departure_day)) like 'mon%' then 'mon'
    else null
  end
where departure_day is not null;
