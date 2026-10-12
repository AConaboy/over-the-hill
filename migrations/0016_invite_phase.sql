-- Which phase of invites a guest belongs to (the hosts send them in
-- rounds): '1', '2', '3', or 'acts' (bands and other acts). Null for
-- guests added by hand. Set by the spreadsheet import (/admin/import).
alter table guests add column invite_phase text check (invite_phase in ('1', '2', '3', 'acts'));
