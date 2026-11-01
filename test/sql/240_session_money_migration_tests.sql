-- Behaviour tests for 114 (session money -> invoices). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;

insert into photographers (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000001');
insert into clients (id, photographer_id, first_name, last_name, email) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ava', 'M', 'ava@x.com'),
  ('c2000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Ben', 'O', 'ben@x.com');

-- Photographer A: an existing invoice already holds #1003 (the "keep" case).
insert into sessions (id, photographer_id, client_id, name, session_date, session_fee) values
  ('50000000-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Wedding (kept)', '2027-04-25', 2500);
insert into invoice_number_counters values ('aaaaaaaa-0000-0000-0000-000000000001', 1003);
insert into invoices (photographer_id, client_id, session_id, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-0000000000a0', 'draft');
insert into invoice_line_items (invoice_id, title, unit_price)
  select id, 'Wedding', 2500 from invoices where session_id = '50000000-0000-0000-0000-0000000000a0';

insert into sessions (id, photographer_id, client_id, name, session_date, created_at, updated_at,
                      session_fee, retainer_amount, retainer_paid, balance_due, balance_due_date, payment_status) values
  -- paid, fee only
  ('50000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Mini shoot', '2026-05-09', '2026-04-01', '2026-10-10', 80, null, false, 80, null, 'paid'),
  -- paid, fee missing -> balance_due
  ('50000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Fee from balance', '2026-06-01', '2026-05-01', '2026-10-10', null, null, false, 75, '2026-06-01', 'paid'),
  -- unpaid, no retainer -> overdue
  ('50000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Unpaid full shoot', '2026-08-01', '2026-07-22', '2026-10-10', 125, null, false, 125, '2026-08-01', 'unpaid'),
  -- paid with retainer -> two payments
  ('50000000-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Portrait', '2026-10-31', '2026-10-01', '2026-11-02', 90, 45, true, 45, null, 'paid'),
  -- unpaid, retainer paid -> schedule + one payment
  ('50000000-0000-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Future booking', '2027-01-15', '2026-10-20', '2026-10-21', 300, 100, true, 200, '2027-01-15', 'unpaid'),
  -- unpaid, retainer not paid -> schedule only
  ('50000000-0000-0000-0000-0000000000a6', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Later booking', null, '2026-10-25', '2026-10-25', 200, 50, false, null, null, 'unpaid'),
  -- paid but no amount anywhere -> skipped
  ('50000000-0000-0000-0000-0000000000a7', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'No amount', '2026-11-01', '2026-10-28', '2026-10-28', null, null, false, null, null, 'paid'),
  -- no client -> skipped
  ('50000000-0000-0000-0000-0000000000a8', 'aaaaaaaa-0000-0000-0000-000000000001', null,
   'No client', '2026-09-01', '2026-08-01', '2026-08-02', 60, null, false, null, null, 'paid'),
  -- untouched session (no money)
  ('50000000-0000-0000-0000-0000000000a9', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Inquiry', null, '2026-10-01', '2026-10-01', null, null, false, null, null, 'unpaid'),
  -- photographer B, separate numbering
  ('50000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
   'B shoot', '2026-09-19', '2026-09-01', '2026-10-31', 125, null, false, null, null, 'paid');

\i sql/114_migrate_session_money.sql

\echo '── numbering'
select t_eq('A numbers in session order, skipping the kept #1003',
  (select string_agg(s.name || '=' || i.invoice_number, ', ' order by i.invoice_number)
     from invoices i join sessions s on s.id = i.session_id where i.photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Mini shoot=1001, Fee from balance=1002, Wedding (kept)=1003, Unpaid full shoot=1004, Portrait=1005, Future booking=1006, Later booking=1007');
select t_eq('A counter continues after the highest', (select next_number from invoice_number_counters where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1008);
select t_eq('B starts at 1001', (select invoice_number from invoices where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1001);
select t_eq('B counter', (select next_number from invoice_number_counters where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1002);

\echo '── money'
select t_eq('totals and status per invoice',
  (select string_agg(s.name || ':' || t.status || ' ' || t.total || '/' || t.amount_paid || ' ' || t.payment_status || coalesce(' due ' || t.next_due_date, '') || case when t.is_overdue then ' OVERDUE' else '' end, '; ' order by t.invoice_number)
     from invoice_totals t join sessions s on s.id = t.session_id
    where t.photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and t.invoice_number <> 1003),
  'Mini shoot:sent 80.00/80.00 paid; Fee from balance:sent 75.00/75.00 paid due 2026-06-01; Unpaid full shoot:sent 125.00/0.00 unpaid due 2026-08-01 OVERDUE; Portrait:sent 90.00/90.00 paid; Future booking:sent 300.00/100.00 partial due 2027-01-15; Later booking:sent 200.00/0.00 unpaid due 2026-10-25 OVERDUE');
select t_eq('paid date = least(session_date, updated_at)',
  (select string_agg(p.paid_date::text, ',' order by p.paid_date) from invoice_payments p join invoices i on i.id = p.invoice_id
    where i.session_id in ('50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a2')), '2026-05-09,2026-06-01');
select t_eq('retainer + balance payments',
  (select string_agg(p.amount || ' ' || p.note, '; ' order by p.note desc) from invoice_payments p join invoices i on i.id = p.invoice_id
    where i.session_id = '50000000-0000-0000-0000-0000000000a4'), '45.00 Retainer (imported from session); 45.00 Balance (imported from session)');
select t_eq('schedule rows',
  (select string_agg(sc.sequence || ':' || sc.amount || '@' || coalesce(sc.due_date::text, '-'), ' ' order by sc.sequence) from invoice_payment_schedule sc join invoices i on i.id = sc.invoice_id
    where i.session_id = '50000000-0000-0000-0000-0000000000a5'), '1:100.00@2026-10-20 2:200.00@2027-01-15');
select t_eq('line copies the session name, non-taxable',
  (select title || ' ' || quantity || 'x' || unit_price || ' ' || taxable from invoice_line_items li join invoices i on i.id = li.invoice_id
    where i.session_id = '50000000-0000-0000-0000-0000000000a1'), 'Mini shoot 1.00x80.00 false');
select t_eq('created_at copied from the session',
  (select created_at::date from invoices where session_id = '50000000-0000-0000-0000-0000000000a1'), '2026-04-01'::date);
select t_eq('client snapshot filled', (select client_name from invoices where session_id = '50000000-0000-0000-0000-0000000000a1'), 'Ava M');
select t_eq('kept invoice untouched', (select status || ' ' || invoice_number from invoices where session_id = '50000000-0000-0000-0000-0000000000a0'), 'draft 1003');

\echo '── report'
select t_eq('report outcomes',
  (select string_agg(session_name || '=' || outcome, ', ' order by session_name) from fv_money_migration_report where outcome <> 'migrated'),
  'No amount=skipped, No client=skipped, Wedding (kept)=skipped');
select t_eq('nothing failed', (select count(*) from fv_money_migration_report where outcome = 'FAILED'), 0::bigint);
select t_eq('session status view sees them', (select payment_status from session_invoice_status where session_id = '50000000-0000-0000-0000-0000000000a5'), 'partial');

\echo '── re-run changes nothing'
select count(*) as before_inv from invoices \gset
select count(*) as before_pay from invoice_payments \gset
\i sql/114_migrate_session_money.sql
select t_eq('no new invoices', (select count(*) from invoices), :before_inv::bigint);
select t_eq('no new payments', (select count(*) from invoice_payments), :before_pay::bigint);
select t_eq('re-run skipped everything', (select count(*) from fv_money_migration_report where outcome = 'migrated'), 0::bigint);
select t_eq('counter unchanged', (select next_number from invoice_number_counters where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1008);

\echo '── a deleted number is reused by a later legacy session'
delete from invoices where session_id = '50000000-0000-0000-0000-0000000000a2';
\i sql/114_migrate_session_money.sql
select t_eq('hole at 1002 filled again', (select invoice_number from invoices where session_id = '50000000-0000-0000-0000-0000000000a2'), 1002);
select t_eq('counter still after max', (select next_number from invoice_number_counters where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1008);

\echo 'ALL 240 TESTS PASSED'
