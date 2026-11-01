-- Behaviour tests for 118 (invoice email templates + log). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_fail(p_sql text, p_expect text) returns text language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_expect || '%' then return 'ok'; end if;
    raise exception 'FAIL: % -> wrong error: %', p_sql, sqlerrm;
  end;
  raise exception 'FAIL: expected error "%" but succeeded: %', p_expect, p_sql;
end $$;
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;
grant execute on function t_fail(text, text), t_eq(text, anyelement, anyelement) to authenticated, anon;

insert into photographers (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000001');
insert into clients (id, photographer_id, first_name, email) values ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ava', 'ava@x.com');
insert into invoices (photographer_id, client_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'sent');
insert into invoice_email_log (invoice_id, photographer_id, kind, sent_to, subject)
  select id, photographer_id, 'invoice', 'ava@x.com', 'Invoice #1001' from invoices;
insert into invoice_email_templates (id, photographer_id, kind, name, subject) values
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'invoice', 'A', 'S'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'invoice', 'B', 'S'),
  ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'reminder', 'R', 'S'),
  ('e0000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'invoice', 'Other', 'S');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '── RLS'
select t_eq('sees own templates only', (select count(*) from invoice_email_templates), 3::bigint);
select t_eq('sees own log', (select count(*) from invoice_email_log), 1::bigint);
select t_fail($$insert into invoice_email_log (invoice_id, photographer_id, kind, sent_to, subject) select id, photographer_id, 'invoice', 'x', 'y' from invoices$$, 'permission denied');
select t_fail($$insert into invoice_email_templates (photographer_id, kind, name, subject) values ('bbbbbbbb-0000-0000-0000-000000000001', 'invoice', 'x', 'y')$$, 'row-level security');
select t_fail($$insert into invoice_email_templates (photographer_id, kind, name, subject) values ('aaaaaaaa-0000-0000-0000-000000000001', 'thanks', 'x', 'y')$$, 'check');

\echo '── defaults: one per kind'
select set_default_invoice_email_template('invoice', 'e0000000-0000-0000-0000-000000000001');
select set_default_invoice_email_template('reminder', 'e0000000-0000-0000-0000-000000000003');
select set_default_invoice_email_template('invoice', 'e0000000-0000-0000-0000-000000000002');
select t_eq('switching moves the default', (select string_agg(name, ',' order by name) from invoice_email_templates where is_default), 'B,R');
select t_fail($$select set_default_invoice_email_template('reminder', 'e0000000-0000-0000-0000-000000000001')$$, 'Template not found');
select t_fail($$select set_default_invoice_email_template('invoice', 'e0000000-0000-0000-0000-000000000004')$$, 'Template not found');
select set_default_invoice_email_template('invoice', null);
select t_eq('null clears only that kind', (select string_agg(name, ',' order by name) from invoice_email_templates where is_default), 'R');
reset role;

set role anon;
select t_fail($$select count(*) from invoice_email_templates$$, 'permission denied');
select t_fail($$select count(*) from invoice_email_log$$, 'permission denied');
reset role;

\echo 'ALL 260 TESTS PASSED'
