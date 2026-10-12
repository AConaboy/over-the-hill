-- The communal playlist: guests pick up to three songs on their RSVP, and
-- the site adds them to a Spotify playlist owned by a host's account.

-- The one Spotify account a host connected (admin Spotify), and the
-- playlist songs go into. One row at most. The refresh token lives here,
-- not in a Worker secret, because Spotify can hand back a new one on any
-- refresh and the Worker has to keep it.
create table spotify_auth (
  id                 integer primary key check (id = 1),
  refresh_token      text not null,
  access_token       text,
  access_expires_at  text,
  account_id         text not null,
  account_name       text,
  playlist_id        text,
  playlist_url       text,
  updated_at         text not null
);

-- A guest's picks. The title, artist and art are kept as Spotify gave them
-- when picked, for the guest page, emails and admin. added_at is when the
-- track went onto the playlist (null: not yet, e.g. Spotify was down; admin
-- Spotify retries). Two guests can pick the same track; it's on the
-- playlist once, and only comes off when nobody's picked it any more.
create table song_picks (
  id          text primary key,
  guest_id    text not null references guests(id) on delete cascade,
  track_id    text not null,
  title       text not null,
  artist      text not null,
  image_url   text,
  position    integer not null check (position between 1 and 3),
  added_at    text,
  created_at  text not null,
  unique (guest_id, track_id)
);

create index song_picks_by_track on song_picks (track_id);
