-- The invite import's to-fix list (/admin/import/fix): rows it couldn't
-- import (no known surname) and names that may be the same person, kept
-- until a host sorts them out, however long that takes.
create table import_issues (
  id text primary key,
  -- 'skipped' or 'duplicate'
  kind text not null check (kind in ('skipped', 'duplicate')),
  -- Stable per spreadsheet row (or pair), so importing the same file again
  -- doesn't add it twice.
  source_key text not null unique,
  -- The phase it belongs to ('1', '2', '3', 'acts'), if known.
  phase text,
  -- skipped: the row as written in the sheet, and why
  host text,
  round text,
  first_name text,
  surname text,
  reason text,
  -- duplicate: the two candidates, as JSON [{name, group, inviters, performer}, …]
  candidates text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  -- Hosts' notes for each other ("asked Emma for his surname").
  note text,
  resolution text,
  updated_by text,
  updated_at text not null,
  created_at text not null
);

create index import_issues_by_status on import_issues (status, kind);
