-- Everything the QA suite makes is marked: guest ids start "qa-" and names
-- contain "Qatest"; the test spreadsheet's names all start "Qa". Nothing
-- else in the local database is touched.
delete from guests where id like 'qa-%' or name like '%Qatest%';
delete from import_issues where source_key like '%qatest%' or source_key like '%|qa%';
