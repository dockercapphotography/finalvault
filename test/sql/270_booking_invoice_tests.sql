-- Behaviour tests for 120 (booking draft invoices). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;

insert into photographers (id, default_invoice_platform) values ('aaaaaaaa-0000-0000-0000-000000000001', 'venmo'), ('bbbbbbbb-0000-0000-0000-000000000001', null);
insert into clients (id, photographer_id, first_name) values ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ava');
insert into signup_shoot_types (id, name, price, retainer_amount) values
  ('51000000-0000-0000-0000-000000000001', 'Micro Wedding', 500, 250),
  ('51000000-0000-0000-0000-000000000002', 'Mini Session', 125, null),
  ('51000000-0000-0000-0000-000000000003', 'Walk-up', null, null),
  ('51000000-0000-0000-0000-000000000004', 'Templated', 999, 100),
  ('51000000-0000-0000-0000-000000000005', 'Foreign template', 300, null);

-- Template for photographer A: catalog Session Fee at 350 x2 + custom Album 300, 8% tax, 50/50 schedule
update invoice_catalog_items set default_unit_price = 350 where name = 'Session Fee';
do $$
declare v uuid; fee uuid;
begin
  select id into fee from invoice_catalog_items where name = 'Session Fee' and photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  insert into invoice_templates (id, photographer_id, name, tax_rate, notes) values ('7e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Wedding', 8, 'Thanks!');
  insert into invoice_template_items (template_id, catalog_item_id, quantity, sort_order) values ('7e000000-0000-0000-0000-000000000001', fee, 2, 0);
  insert into invoice_template_items (template_id, title, unit_price, taxable, sort_order) values ('7e000000-0000-0000-0000-000000000001', 'Album', 300, false, 1);
  insert into invoice_template_schedule (template_id, sequence, percent, due_rule, due_days) values
    ('7e000000-0000-0000-0000-000000000001', 1, 33.333, 'on_create', 0), ('7e000000-0000-0000-0000-000000000001', 2, 66.667, 'before_session', 14);
  insert into invoice_templates (id, photographer_id, name) values ('7e000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Not yours');
end $$;
update signup_shoot_types set invoice_template_id = '7e000000-0000-0000-0000-000000000001' where name = 'Templated';
update signup_shoot_types set invoice_template_id = '7e000000-0000-0000-0000-000000000002' where name = 'Foreign template';

insert into sessions (id, photographer_id, client_id, name, session_date) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Micro Wedding — Ava', '2027-05-01'),
  ('50000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Mini — Ava', '2027-05-02'),
  ('50000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Walk-up — Ava', '2027-05-03'),
  ('50000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Templated — Ava', '2027-06-30'),
  ('50000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Foreign — Ava', '2027-05-05'),
  ('50000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'No client', '2027-05-06');

select fv_create_booking_invoice('50000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001');
select fv_create_booking_invoice('50000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002');
select t_eq('no price, no template -> nothing', fv_create_booking_invoice('50000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000003') is null, true);
select fv_create_booking_invoice('50000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000004');
select fv_create_booking_invoice('50000000-0000-0000-0000-000000000005', '51000000-0000-0000-0000-000000000005');
select t_eq('no client -> nothing', fv_create_booking_invoice('50000000-0000-0000-0000-000000000006', '51000000-0000-0000-0000-000000000002') is null, true);
select t_eq('second call -> nothing', fv_create_booking_invoice('50000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001') is null, true);
set constraints all immediate;

select t_eq('price + retainer',
  (select t.status || ' ' || t.total || ' ' || i.payment_platform || ' | ' || (select string_agg(sequence || ':' || amount || '@' || coalesce(due_date::text, '-'), ' ' order by sequence) from invoice_payment_schedule where invoice_id = i.id)
     from invoices i join invoice_totals t on t.invoice_id = i.id where i.session_id = '50000000-0000-0000-0000-000000000001'),
  'draft 500.00 venmo | 1:250.00@' || current_date || ' 2:250.00@2027-05-01');
select t_eq('price only, no schedule',
  (select (select string_agg(title || '=' || unit_price || '/' || taxable, ',') from invoice_line_items where invoice_id = i.id) || ' | ' || (select count(*) from invoice_payment_schedule where invoice_id = i.id)
     from invoices i where i.session_id = '50000000-0000-0000-0000-000000000002'),
  'Mini Session=125.00/false | 0');
select t_eq('template lines + tax + notes',
  (select (select string_agg(title || ' ' || quantity || 'x' || unit_price, ', ' order by sort_order) from invoice_line_items where invoice_id = i.id) || ' | ' || t.total || ' | ' || i.notes
     from invoices i join invoice_totals t on t.invoice_id = i.id where i.session_id = '50000000-0000-0000-0000-000000000004'),
  'Session Fee 2.00x350.00, Album 1.00x300.00 | 1056.00 | Thanks!');
select t_eq('template schedule: rounded split, rule dates',
  (select string_agg(s.sequence || ':' || s.amount || '@' || s.due_date, ' ' order by s.sequence) from invoice_payment_schedule s join invoices i on i.id = s.invoice_id where i.session_id = '50000000-0000-0000-0000-000000000004'),
  '1:352.00@' || current_date || ' 2:704.00@2027-06-16');
select t_eq('other photographer''s template ignored -> price line',
  (select string_agg(title || '=' || unit_price, ',') from invoice_line_items li join invoices i on i.id = li.invoice_id where i.session_id = '50000000-0000-0000-0000-000000000005'),
  'Foreign template=300.00');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  perform fv_create_booking_invoice('50000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000002');
  raise exception 'FAIL: authenticated could call fv_create_booking_invoice';
exception when insufficient_privilege then null;
end $$;
reset role;

\echo '── as anon through a SECURITY DEFINER caller (the public booking page path; 121)'
create or replace function public.t_book_as_anon(p_session uuid, p_type uuid) returns uuid language plpgsql security definer set search_path = public as $$
begin return fv_create_booking_invoice(p_session, p_type); end $$;
grant execute on function public.t_book_as_anon(uuid, uuid) to anon;
insert into sessions (id, photographer_id, client_id, name, session_date) values ('50000000-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Anon booking', '2027-07-01');
set role anon;
select t_book_as_anon('50000000-0000-0000-0000-000000000099', '51000000-0000-0000-0000-000000000001') is not null as anon_booking_committed;
reset role;
select t_eq('anon booking kept its schedule', (select count(*) from invoice_payment_schedule s join invoices i on i.id = s.invoice_id where i.session_id = '50000000-0000-0000-0000-000000000099'), 2::bigint);

\echo 'ALL 270 TESTS PASSED'
