-- Everything the QA suite makes is marked: guest ids start "qa-" and names
-- contain "Qatest"; the test spreadsheet's names all start "Qa". Nothing
-- else in the local database is touched.
delete from guests where id like 'qa-%' or name like '%Qatest%';
delete from import_issues where source_key like '%qatest%' or source_key like '%|qa%';

-- The Emails test's wording, if a failed run left it saved.
delete from content_fields where page_slug = 'email:deposit-due'
  and exists (select 1 from content_fields where page_slug = 'email:deposit-due' and value like '%Qatest%');
