-- Lift share: a guest can offer a lift or ask for one, from somewhere, and
-- say how many spare seats. Hosts see offers and requests together in the
-- planning report and put people in touch; guests never see each other's.
alter table guests add column lift text check (lift in ('offer', 'need'));
alter table guests add column lift_from text;
alter table guests add column lift_seats integer check (lift_seats is null or lift_seats between 0 and 20);
