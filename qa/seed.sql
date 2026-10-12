-- QA guests, one for each state the site handles. Emails go to Resend's
-- test address (accepted, never delivered to anyone).
insert into guests (id, token, token_expires_at, name, email, attendance, status, invite_sent_at, invite_phase, created_at, updated_at)
values
  ('qa-unsent', 'qa-token-unsent', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days'), 'QA Unsent Qatest', 'delivered@resend.dev', 'pending', 'invited', null, '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-35 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-sent', 'qa-token-sent', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QA Sent Qatest', 'delivered@resend.dev', 'pending', 'invited', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-opened', 'qa-token-opened', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QA Opened Qatest', null, 'pending', 'viewed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-expired', 'qa-token-expired', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'), 'QA Expired Qatest', null, 'pending', 'invited', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-40 days'), '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-40 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-no', 'qa-token-no', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QA No Qatest', null, 'no', 'rsvp_no', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-cancelled', 'qa-token-cancelled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QA Cancelled Qatest', null, 'yes', 'cancelled', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- two who are coming, with everything filled in (for the report, CSV, PDF
-- and check-in), and a free performer whose note looks like a formula
insert into guests (id, token, token_expires_at, ticket_ref, name, email, attendance, status, registered_at, payment_status, amount_paid_pence,
                    arrival_day, departure_day, camping, vehicle, dietary, accessibility, lift, lift_from, lift_seats, invite_sent_at, invite_phase, created_at, updated_at)
values
  ('qa-yes', 'qa-token-yes', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QATEST01', 'QA Yes Qatest', 'delivered@resend.dev', 'yes', 'rsvp_yes', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'deposit_paid', 2000,
   'fri', 'sun', 'camping', 'car', 'Vegan', 'Step-free access', 'offer', 'Bristol', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('qa-due', 'qa-token-due', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QATEST02', 'QA Due Qatest', null, 'yes', 'rsvp_yes', null, 'unpaid', 0,
   'thu', 'mon', 'not_camping', 'campervan', null, null, 'need', 'bristol', null, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), '2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

insert into guests (id, token, token_expires_at, ticket_ref, name, attendance, status, registered_at, is_performer, amount_due_pence, notes, invite_sent_at, invite_phase, created_at, updated_at)
values ('qa-performer', 'qa-token-performer', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 'QATEST03', 'QA Performer Qatest', 'yes', 'rsvp_yes', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1, 0,
        '=HYPERLINK("http://example.com")', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'acts', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

insert into guest_inviters (id, guest_id, inviter_name) values
  ('qa-inv-1', 'qa-unsent', 'QA-Host-A'), ('qa-inv-2', 'qa-sent', 'QA-Host-A'), ('qa-inv-3', 'qa-yes', 'QA-Host-B'), ('qa-inv-4', 'qa-due', 'QA-Host-B');

insert into guest_events (id, guest_id, at, actor, action, detail) values
  ('qa-ev-1', 'qa-opened', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'guest', 'opened', 'Opened their invite');
