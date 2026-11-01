-- Behaviour tests for migrations 107–110. Run as postgres on a fresh copy.
\set ON_ERROR_STOP 1
\pset footer off

create or replace function t_fail(p_sql text, p_expect text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
    execute 'set constraints all immediate';
  exception when others then
    if sqlerrm ilike '%' || p_expect || '%' then
      return 'ok';
    end if;
    raise exception 'FAIL: % -> wrong error: %', p_sql, sqlerrm;
  end;
  raise exception 'FAIL: expected error "%" but succeeded: %', p_expect, p_sql;
end $$;
grant execute on function t_fail(text, text) to authenticated, anon, service_role;

create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL %: got %, want %', p_label, p_got, p_want;
  end if;
  return 'ok  ' || p_label;
end $$;
grant execute on function t_eq(text, anyelement, anyelement) to authenticated, anon, service_role;

-- ── Fixtures (as postgres) ───────────────────────────────────────────────
insert into photographers (id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'B');
insert into clients (id, photographer_id, first_name, last_name, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Dana', 'Ruiz', 'dana@example.com'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000001', 'Maya', 'Rodriguez', 'maya@example.com'),
  ('bbbbbbbb-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-000000000001', 'Other', 'Client', 'o@example.com');
insert into sessions (id, photographer_id, client_id, name, mode, session_date) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'Wedding', 'private', '2026-09-12'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2', 'Portraits', 'private', '2026-10-01'),
  ('bbbbbbbb-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'B session', 'private', '2026-10-01');

\echo '── 110 seed'
select t_eq('signup trigger seeded 12 items for A', (select count(*) from invoice_catalog_items where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 12::bigint);
select public.seed_default_invoice_catalog(id) from photographers;
select t_eq('backfill re-run adds nothing', (select count(*) from invoice_catalog_items), 24::bigint);
select t_eq('travel is non-taxable, per mile', (select taxable_default::text || unit_label from invoice_catalog_items where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Travel Fee'), 'falsemi');

-- ── Act as photographer A ────────────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '── numbering and the mockup example'
insert into invoices (photographer_id, client_id, session_id, invoice_number, tax_rate, discount_rate)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000d1', 5, 8, 10);
select t_eq('first invoice is 1001 (caller value ignored)', (select invoice_number from invoices), 1001);
select t_eq('client copy saved', (select client_name || ' / ' || client_email from invoices), 'Dana Ruiz / dana@example.com');
insert into invoice_line_items (invoice_id, catalog_item_id, title, quantity, unit_price, taxable, sort_order)
select i.id, null, 'Full Wedding Package', 1, 2200, true, 1 from invoices i where invoice_number = 1001;
insert into invoice_line_items (invoice_id, title, quantity, unit_price, unit_label, taxable, sort_order)
select i.id, 'Travel Fee', 1, 75, null, false, 2 from invoices i where invoice_number = 1001;
select subtotal, discount_amount, taxable_after_discount, tax_amount, total, payment_status from invoice_totals;
select t_eq('mockup total', (select total from invoice_totals where invoice_number = 1001), 2205.90::numeric);
-- fractional quantity rounds per line: 37.5 mi x $0.65 = 24.375 -> 24.38
insert into invoices (photographer_id, client_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2');
insert into invoice_line_items (invoice_id, title, quantity, unit_price) select id, 'Mileage', 37.5, 0.65 from invoices where invoice_number = 1002;
insert into invoice_line_items (invoice_id, title, quantity, unit_price) select id, 'Mileage', 37.5, 0.65 from invoices where invoice_number = 1002;
select t_eq('line totals rounded before summing', (select subtotal from invoice_totals where invoice_number = 1002), 48.76::numeric);

\echo '── cross-account protection'
select t_fail($$insert into invoices (photographer_id, client_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000c1')$$, 'invoices_client_fkey');
select t_fail($$insert into invoices (photographer_id, client_id, session_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-0000000000d1')$$, 'invoices_session_fkey');
select t_fail($$insert into invoices (photographer_id, client_id) values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000c1')$$, 'row-level security');
select t_fail($$insert into invoices (photographer_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$, 'needs a client');
reset role;
select id as b_item from invoice_catalog_items where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001' limit 1 \gset
set role authenticated;
select t_fail(format($$insert into invoice_line_items (invoice_id, catalog_item_id, title, unit_price) select id, %L, 'x', 1 from invoices where invoice_number = 1002$$, :'b_item'), 'doesn''t belong to this account');
select t_eq('A cannot see B catalog', (select count(*) from invoice_catalog_items where photographer_id <> 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint);
select t_fail($$select * from invoice_number_counters$$, 'permission denied');
select t_fail($$select seed_default_invoice_catalog('aaaaaaaa-0000-0000-0000-000000000001')$$, 'permission denied');

\echo '── schedule must add up'
select t_fail($$insert into invoice_payment_schedule (invoice_id, sequence, amount) select id, 1, 1000 from invoices where invoice_number = 1001$$, 'adds up to 1000.00 but the invoice total is 2205.90');
begin;
insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date)
  select id, 1, 1102.95, current_date - 30 from invoices where invoice_number = 1001;
insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date)
  select id, 2, 1102.95, current_date + 30 from invoices where invoice_number = 1001;
commit;
select t_eq('2-row schedule saved', (select count(*) from invoice_payment_schedule), 2::bigint);
-- changing a line item without rebalancing is rejected at commit
select t_fail($$update invoice_line_items set unit_price = 2300 where title = 'Full Wedding Package'$$, 'adds up to');
-- changing it and rebalancing in one transaction is fine (what save_invoice will do)
begin;
update invoice_line_items set unit_price = 2300 where title = 'Full Wedding Package';
update invoice_payment_schedule set amount = amount + 97.20 where sequence = 2;  -- +100 line, -10 discount, +7.20 tax
commit;
select t_eq('total after edit', (select total from invoice_totals where invoice_number = 1001), 2303.10::numeric);
select t_eq('schedule still matches', (select sum(amount) from invoice_payment_schedule), 2303.10::numeric);

\echo '── first payment locks the invoice'
update invoices set status = 'sent' where invoice_number = 1001;
select t_eq('is overdue (installment 1 due 30 days ago)', (select is_overdue from invoice_totals where invoice_number = 1001), true);
insert into invoice_payments (invoice_id, amount, method) select id, 1102.95, 'venmo' from invoices where invoice_number = 1001;
select sequence, amount, allocated, row_status, is_locked from invoice_schedule_status order by sequence;
select t_eq('installment 1 paid', (select row_status from invoice_schedule_status where sequence = 1), 'paid');
select t_eq('invoice partial, not overdue now', (select payment_status || ' ' || is_overdue from invoice_totals where invoice_number = 1001), 'partial false');
select t_fail($$update invoice_line_items set unit_price = 1 where title = 'Travel Fee'$$, 'locked because a payment');
select t_fail($$insert into invoice_line_items (invoice_id, title, unit_price) select id, 'x', 1 from invoices where invoice_number = 1001$$, 'locked because a payment');
select t_fail($$delete from invoice_line_items where title = 'Travel Fee'$$, 'locked because a payment');
select t_fail($$update invoices set tax_rate = 7 where invoice_number = 1001$$, 'tax and discount are locked');
select t_fail($$update invoices set client_id = 'aaaaaaaa-0000-0000-0000-0000000000c2' where invoice_number = 1001$$, 'are locked');
update invoices set due_date = current_date + 60, notes = 'Thanks!', payment_platform = 'venmo' where invoice_number = 1001;
select t_eq('due date / notes / platform still editable', (select notes from invoices where invoice_number = 1001), 'Thanks!');
select t_fail($$update invoice_payment_schedule set due_date = current_date where sequence = 1$$, 'paid and locked');
select t_fail($$delete from invoice_payment_schedule where sequence = 1$$, 'can''t be removed');
select t_fail($$insert into invoice_payment_schedule (invoice_id, sequence, amount) select id, 0, 1 from invoices where invoice_number = 1001$$, 'before one that already has payments');
update invoice_payment_schedule set due_date = current_date + 90 where sequence = 2;
select t_eq('unpaid installment due date editable', (select due_date from invoice_payment_schedule where sequence = 2), current_date + 90);
-- partial installment: can't drop below what's paid
insert into invoice_payments (invoice_id, amount, method) select id, 100, 'cash' from invoices where invoice_number = 1001;
select t_fail($$update invoice_payment_schedule set amount = 50 where sequence = 2$$, 'already has 100.00 paid');

\echo '── status rules'
select t_fail($$update invoices set status = 'draft' where invoice_number = 1001$$, 'can''t go back to draft');
select t_fail($$delete from invoices where invoice_number = 1001$$, 'Only draft invoices');
insert into invoice_payments (invoice_id, amount, method) select id, 10, 'cash' from invoices where invoice_number = 1002;
select t_fail($$delete from invoices where invoice_number = 1002$$, 'has a payment logged');
delete from invoice_payments where invoice_id = (select id from invoices where invoice_number = 1002);
delete from invoices where invoice_number = 1002;
select t_eq('unpaid draft deleted', (select count(*) from invoices where invoice_number = 1002), 0::bigint);
insert into invoices (photographer_id, client_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2');
select t_eq('numbers are not reused', (select max(invoice_number) from invoices), 1003);
update invoices set status = 'void' where invoice_number = 1001;
select t_eq('voided_at set', (select voided_at is not null from invoices where invoice_number = 1001), true);
select t_fail($$update invoices set due_date = current_date where invoice_number = 1001$$, 'void invoice can''t be changed');
select t_fail($$update invoices set status = 'sent' where invoice_number = 1001$$, 'void invoice can''t be changed');
select t_fail($$insert into invoice_payments (invoice_id, amount) select id, 1 from invoices where invoice_number = 1001$$, 'void invoice');
update invoices set notes = 'Voided: reissued as #1004' where invoice_number = 1001;
select t_eq('void notes editable', (select notes from invoices where invoice_number = 1001), 'Voided: reissued as #1004');

\echo '── catalog delete vs archive'
insert into invoice_line_items (invoice_id, catalog_item_id, title, unit_price)
  select (select id from invoices where invoice_number = 1003), id, name, 350 from invoice_catalog_items where name = 'Session Fee';
select t_fail($$delete from invoice_catalog_items where name = 'Session Fee'$$, 'Archive it instead');
update invoice_catalog_items set active = false where name = 'Session Fee';
delete from invoice_catalog_items where name = 'Reshoot Fee';
select t_eq('unused item deleted, used one archived', (select count(*) || '/' || count(*) filter (where not active) from invoice_catalog_items), '11/1');

\echo '── session board rollup'
select * from session_invoice_status;

\echo '── deleting a session or client keeps the invoices'
insert into invoices (photographer_id, client_id, session_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-0000000000d2');
insert into invoice_line_items (invoice_id, title, unit_price) select id, 'Fee', 100 from invoices where invoice_number = 1004;
update invoices set status = 'sent' where invoice_number = 1004;
select t_eq('session rollup: sent, unpaid', (select payment_status from session_invoice_status where session_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'), 'unpaid');
insert into invoice_payments (invoice_id, amount) select id, 100 from invoices where invoice_number = 1004;
select t_eq('session rollup: paid', (select payment_status || ' ' || invoice_count from session_invoice_status where session_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'), 'paid 1');
delete from sessions where id = 'aaaaaaaa-0000-0000-0000-0000000000d2';
select t_eq('paid invoice became standalone', (select session_id is null from invoices where invoice_number = 1004), true);
delete from clients where id = 'aaaaaaaa-0000-0000-0000-0000000000c2';
select t_eq('client detached, copy kept', (select coalesce(client_id::text, 'null') || ' ' || client_name from invoices where invoice_number = 1004), 'null Maya Rodriguez');
select t_eq('void invoice also detaches cleanly', (select count(*) from invoices where client_id is null), 2::bigint);
select t_eq('still paid', (select payment_status from invoice_totals where invoice_number = 1004), 'paid');

\echo '── roles'
reset role;
set role anon;
select t_fail($$select * from invoices$$, 'permission denied');
select t_fail($$select * from invoice_totals$$, 'permission denied');
select t_fail($$select * from invoice_catalog_items$$, 'permission denied');
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select t_eq('B sees none of A''s invoices', (select count(*) from invoices), 0::bigint);
select t_eq('B sees none of A''s totals', (select count(*) from invoice_totals), 0::bigint);

\echo '── service role cleanup and account deletion'
reset role;
set role service_role;
delete from invoices where invoice_number = 1004 and photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t_eq('service role can delete a sent, paid invoice', (select count(*) from invoices where invoice_number = 1004), 0::bigint);
reset role;
create policy "test only: delete own profile" on photographers for delete using (auth.uid() = id);
insert into invoice_line_items (invoice_id, catalog_item_id, title, unit_price)
  select (select id from invoices where invoice_number = 1003), id, name, 1 from invoice_catalog_items where name = 'Travel Fee' and photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from photographers where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select t_eq('account deletion removes everything', (select count(*) from invoices) + (select count(*) from invoice_catalog_items where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001') + (select count(*) from invoice_number_counters where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint);

\echo 'ALL TESTS PASSED'
