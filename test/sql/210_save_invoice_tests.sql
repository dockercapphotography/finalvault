-- Behaviour tests for 111 (save_invoice, duplicate_invoice). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off

create or replace function t_fail(p_sql text, p_expect text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
    execute 'set constraints all immediate';
  exception when others then
    if sqlerrm ilike '%' || p_expect || '%' then return 'ok'; end if;
    raise exception 'FAIL: % -> wrong error: %', p_sql, sqlerrm;
  end;
  raise exception 'FAIL: expected error "%" but succeeded: %', p_expect, p_sql;
end $$;
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text
language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;
grant execute on function t_fail(text, text), t_eq(text, anyelement, anyelement) to authenticated;

insert into photographers (id, display_name) values ('eeeeeeee-0000-0000-0000-000000000001', 'E'), ('ffffffff-0000-0000-0000-000000000001', 'F');
update photographers set default_invoice_platform = 'venmo' where id = 'eeeeeeee-0000-0000-0000-000000000001';
insert into clients (id, photographer_id, first_name, last_name, email) values
  ('eeeeeeee-0000-0000-0000-0000000000c1', 'eeeeeeee-0000-0000-0000-000000000001', 'Dana', 'Ruiz', 'dana@example.com'),
  ('ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-000000000001', 'Other', 'Person', 'o@example.com');
insert into sessions (id, photographer_id, client_id, name) values
  ('eeeeeeee-0000-0000-0000-0000000000d1', 'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-0000000000c1', 'Wedding');

set role authenticated;
set request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000001';

\echo '── create with items and schedule in one call'
select save_invoice($j${
  "client_id": "eeeeeeee-0000-0000-0000-0000000000c1",
  "session_id": "eeeeeeee-0000-0000-0000-0000000000d1",
  "tax_rate": 8, "discount_rate": 10, "notes": "  Thanks!  ",
  "line_items": [
    {"title": "Full Wedding Package", "description": "10 hours", "quantity": 1, "unit_price": 2200, "taxable": true},
    {"title": "Travel Fee", "quantity": 1, "unit_price": 75, "taxable": false}
  ],
  "schedule": [{"amount": 1102.95, "due_date": "2026-11-15"}, {"amount": 1102.95, "due_date": "2027-05-01"}]
}$j$::jsonb) as id \gset
select t_eq('number 1001', (select invoice_number from invoices where id = :'id'), 1001);
select t_eq('total 2205.90', (select total from invoice_totals where invoice_id = :'id'), 2205.90::numeric);
select t_eq('default platform applied', (select payment_platform from invoices where id = :'id'), 'venmo');
select t_eq('notes trimmed', (select notes from invoices where id = :'id'), 'Thanks!');
select t_eq('2 installments', (select count(*) from invoice_payment_schedule where invoice_id = :'id'), 2::bigint);
select t_fail($$select save_invoice('{"client_id":"eeeeeeee-0000-0000-0000-0000000000c1","line_items":[{"title":"A","quantity":1,"unit_price":100}],"schedule":[{"amount":50}]}'::jsonb)$$, 'adds up to 50.00');

\echo '── edit: change a price and rebalance in the same save'
select id as li1 from invoice_line_items where invoice_id = :'id' and title = 'Full Wedding Package' \gset
select id as li2 from invoice_line_items where invoice_id = :'id' and title = 'Travel Fee' \gset
select id as s1 from invoice_payment_schedule where invoice_id = :'id' and sequence = 1 \gset
select id as s2 from invoice_payment_schedule where invoice_id = :'id' and sequence = 2 \gset
select save_invoice(jsonb_build_object(
  'id', :'id',
  'line_items', jsonb_build_array(
     jsonb_build_object('id', :'li1', 'title', 'Full Wedding Package', 'description', '10 hours', 'quantity', 1, 'unit_price', 2300, 'taxable', true),
     jsonb_build_object('id', :'li2', 'title', 'Travel Fee', 'quantity', 1, 'unit_price', 75, 'taxable', false)),
  'schedule', jsonb_build_array(
     jsonb_build_object('id', :'s1', 'amount', 1102.95, 'due_date', '2026-11-15'),
     jsonb_build_object('id', :'s2', 'amount', 1200.15, 'due_date', '2027-05-01'))));
select t_eq('new total', (select total from invoice_totals where invoice_id = :'id'), 2303.10::numeric);
select t_eq('line ids kept', (select count(*) from invoice_line_items where id in (:'li1', :'li2')), 2::bigint);
-- reorder lines and add one, remove travel
select save_invoice(jsonb_build_object('id', :'id', 'schedule', '[]'::jsonb,
  'line_items', jsonb_build_array(
     jsonb_build_object('title', 'Album', 'quantity', 1, 'unit_price', 300, 'taxable', true),
     jsonb_build_object('id', :'li1', 'title', 'Full Wedding Package', 'quantity', 1, 'unit_price', 2300, 'taxable', true))));
select t_eq('lines reordered, travel removed', (select string_agg(title, ',' order by sort_order) from invoice_line_items where invoice_id = :'id'), 'Album,Full Wedding Package');
select t_eq('schedule cleared', (select count(*) from invoice_payment_schedule where invoice_id = :'id'), 0::bigint);
select t_eq('description cleared when omitted', (select description from invoice_line_items where id = :'li1'), null::text);
select t_fail(format($$select save_invoice('{"id":"%s","line_items":[{"id":"%s","title":"x","quantity":1,"unit_price":1}]}'::jsonb)$$, :'id', gen_random_uuid()), 'no longer exists');
select t_fail(format($$select save_invoice('{"id":"%s","line_items":[{"title":"   ","quantity":1,"unit_price":1}]}'::jsonb)$$, :'id'), 'check constraint');

\echo '── send in the same save; locked after a payment'
select save_invoice(jsonb_build_object('id', :'id', 'status', 'sent',
  'schedule', '[{"amount": 1500, "due_date": "2026-11-15"}, {"amount": 1027.20, "due_date": "2027-05-01"}]'::jsonb));
select t_eq('sent', (select status || ' ' || (sent_at is not null) from invoices where id = :'id'), 'sent true');
select t_eq('total matches schedule', (select total from invoice_totals where invoice_id = :'id'), 2527.20::numeric);
insert into invoice_payments (invoice_id, amount, method) values (:'id', 1500, 'venmo');
select id as s1 from invoice_payment_schedule where invoice_id = :'id' and sequence = 1 \gset
select id as s2 from invoice_payment_schedule where invoice_id = :'id' and sequence = 2 \gset
select id as la from invoice_line_items where invoice_id = :'id' and title = 'Album' \gset
-- the editor sends everything back unchanged plus a new due date and notes: allowed
select save_invoice(jsonb_build_object('id', :'id', 'notes', 'Paid deposit, thanks', 'due_date', '2027-05-01',
  'client_id', 'eeeeeeee-0000-0000-0000-0000000000c1', 'session_id', 'eeeeeeee-0000-0000-0000-0000000000d1',
  'tax_rate', 8, 'discount_rate', 10,
  'line_items', jsonb_build_array(
     jsonb_build_object('id', :'la', 'title', 'Album', 'quantity', 1, 'unit_price', 300, 'taxable', true),
     jsonb_build_object('id', :'li1', 'title', 'Full Wedding Package', 'quantity', 1, 'unit_price', 2300, 'taxable', true)),
  'schedule', jsonb_build_array(
     jsonb_build_object('id', :'s1', 'amount', 1500, 'due_date', '2026-11-15'),
     jsonb_build_object('id', :'s2', 'amount', 1027.20, 'due_date', '2027-06-01'))));
select t_eq('unchanged locked save ok, notes + installment 2 date saved',
  (select notes || ' ' || (select due_date from invoice_payment_schedule where id = :'s2') from invoices where id = :'id'), 'Paid deposit, thanks 2027-06-01');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'line_items', '[{"title":"Album","quantity":1,"unit_price":999,"taxable":true}]'::jsonb))$$, :'id'), 'locked because a payment');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'tax_rate', 7))$$, :'id'), 'are locked');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'schedule', jsonb_build_array(jsonb_build_object('id', %L, 'amount', 1000), jsonb_build_object('id', %L, 'amount', 1527.20))))$$, :'id', :'s1', :'s2'), 'paid and locked');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'schedule', jsonb_build_array(jsonb_build_object('id', %L, 'amount', 1027.20), jsonb_build_object('id', %L, 'amount', 1500, 'due_date', '2026-11-15'))))$$, :'id', :'s2', :'s1'), 'reordered');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'schedule', jsonb_build_array(jsonb_build_object('amount', 1), jsonb_build_object('id', %L, 'amount', 1500, 'due_date', '2026-11-15'))))$$, :'id', :'s1'), 'go after the existing');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'schedule', '[]'::jsonb))$$, :'id'), 'can''t be removed');
-- split the unpaid installment into two
select save_invoice(jsonb_build_object('id', :'id', 'schedule', jsonb_build_array(
  jsonb_build_object('id', :'s1', 'amount', 1500, 'due_date', '2026-11-15'),
  jsonb_build_object('id', :'s2', 'amount', 527.20, 'due_date', '2027-03-01'),
  jsonb_build_object('amount', 500, 'due_date', '2027-06-01'))));
select t_eq('unpaid installment split', (select string_agg(sequence || ':' || amount, ' ' order by sequence) from invoice_payment_schedule where invoice_id = :'id'), '1:1500.00 2:527.20 3:500.00');
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'status', 'draft'))$$, :'id'), 'back to draft');

\echo '── duplicate'
select duplicate_invoice(:'id') as dup \gset
select t_eq('duplicate is a new draft', (select status || ' #' || invoice_number from invoices where id = :'dup'), 'draft #1002');
select t_eq('items copied', (select string_agg(title, ',' order by sort_order) from invoice_line_items where invoice_id = :'dup'), 'Album,Full Wedding Package');
select t_eq('schedule amounts copied, no dates', (select string_agg(amount || '/' || coalesce(due_date::text, '-'), ' ' order by sequence) from invoice_payment_schedule where invoice_id = :'dup'), '1500.00/- 527.20/- 500.00/-');
select t_eq('no payments copied', (select count(*) from invoice_payments where invoice_id = :'dup'), 0::bigint);

\echo '── other accounts'
select t_fail($$select save_invoice('{"client_id":"ffffffff-0000-0000-0000-0000000000c1"}'::jsonb)$$, 'invoices_client_fkey');
set request.jwt.claim.sub = 'ffffffff-0000-0000-0000-000000000001';
select t_fail(format($$select save_invoice(jsonb_build_object('id', %L, 'notes', 'x'))$$, :'id'), 'not found');
select t_fail(format($$select duplicate_invoice(%L)$$, :'id'), 'not found');
reset role;
set role anon;
select t_fail($$select save_invoice('{}'::jsonb)$$, 'permission denied');
reset role;

\echo 'ALL 111 TESTS PASSED'
