-- Behaviour tests for 115 (portal invoices). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;

-- Stubs for the parts of the live schema the portal function reads.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
alter table clients add column portal_password_hash text, add column portal_password_attempts integer default 0,
  add column portal_password_locked_until timestamptz, add column portal_password_last_attempt_at timestamptz;
alter table sessions add column submit_token text;
create table galleries (id uuid primary key, title text, event_name text, event_date date, share_token text, cover_r2_key text,
  cover_focus_x numeric, cover_focus_y numeric, is_active boolean, expires_at timestamptz, require_password boolean,
  plain_password text, require_download_pin boolean, plain_download_pin text);
create table gallery_clients (gallery_id uuid, client_id uuid);
create table gallery_viewers (gallery_id uuid, email text);
create table session_galleries (session_id uuid, gallery_id uuid);
create table contracts (id uuid, client_id uuid, title text, status text, sign_token text, sent_at timestamptz, signed_at timestamptz,
  signed_name text, photographer_signed_at timestamptz, photographer_signed_name text, body_hash text, pdf_r2_key text);
create table session_questionnaires (session_id uuid, questionnaire_id uuid);
create table questionnaire_templates (id uuid, name text);
create table session_submissions (session_id uuid, questionnaire_id uuid, email text);

update photographers set payment_links = '{"venmo": "https://venmo.com/dockercap", "zelle": "nick@example.com"}'::jsonb;
insert into photographers (id, payment_links, default_invoice_platform) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"venmo": "https://venmo.com/dockercap", "zelle": " nick@example.com "}', 'venmo'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '{}', null);
insert into clients (id, photographer_id, first_name, last_name, email, portal_token) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ava', 'M', 'ava@x.com', 'tok-ava'),
  ('c1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ben', 'O', 'ben@x.com', 'tok-ben');
insert into sessions (id, photographer_id, client_id, name, session_date) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Wedding', '2027-04-25');

-- Ava: a sent invoice with a schedule and a partial payment, a sent paid one,
-- a draft and a void. Ben: one sent invoice.
do $$
declare v uuid;
begin
  -- 1001: sent, session, schedule 500 + 1705.90, 300 paid, zelle override
  insert into invoices (photographer_id, client_id, session_id, status, tax_rate, discount_rate, payment_platform, notes, due_date)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
            'draft', 8, 10, 'zelle', 'Thank you!', '2027-04-01') returning id into v;
  insert into invoice_line_items (invoice_id, title, description, quantity, unit_price, taxable, sort_order) values
    (v, 'Wedding', '8 hours', 1, 2200, true, 0), (v, 'Travel', null, 100, 0.75, false, 1);
  insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date) values
    (v, 1, 500, '2026-11-15'), (v, 2, 1705.90, '2027-04-01');
  update invoices set status = 'sent' where id = v;
  insert into invoice_payments (invoice_id, amount, paid_date, method, note) values (v, 300, '2026-10-30', 'venmo', 'private note');
  -- 1002: sent, paid in full, no platform -> default venmo
  insert into invoices (photographer_id, client_id, status) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'sent') returning id into v;
  insert into invoice_line_items (invoice_id, title, unit_price, taxable) values (v, 'Prints', 120, false);
  insert into invoice_payments (invoice_id, amount, paid_date) values (v, 120, '2026-10-01');
  -- 1003: draft (hidden)
  insert into invoices (photographer_id, client_id, status) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'draft') returning id into v;
  insert into invoice_line_items (invoice_id, title, unit_price) values (v, 'Draft line', 50);
  -- 1004: void (hidden)
  insert into invoices (photographer_id, client_id, status) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'sent') returning id into v;
  insert into invoice_line_items (invoice_id, title, unit_price) values (v, 'Void line', 60);
  update invoices set status = 'void' where id = v;
  -- 1005: Ben's
  insert into invoices (photographer_id, client_id, status) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'sent') returning id into v;
  insert into invoice_line_items (invoice_id, title, unit_price) values (v, 'Ben line', 10);
end $$;

\echo '── anon calls it, sees only sent invoices for that token'
set role anon;
select get_client_portal_data('tok-ava', null) as d \gset
reset role;
select t_eq('two invoices, newest sent first', (select string_agg(x->>'invoice_number', ',') from json_array_elements(:'d'::json->'invoices') x), '1002,1001');
select t_eq('existing keys still there', (select string_agg(k, ',' order by k) from json_object_keys(:'d'::json) k),
  'client,contracts,galleries,invoices,password_required,pending_questionnaires');

select (select x from json_array_elements(:'d'::json->'invoices') x where x->>'invoice_number' = '1001') as inv \gset
select t_eq('money', (:'inv'::json->>'subtotal') || ' ' || (:'inv'::json->>'discount_amount') || ' ' || (:'inv'::json->>'tax_amount') || ' ' || (:'inv'::json->>'total') || ' ' || (:'inv'::json->>'amount_paid') || ' ' || (:'inv'::json->>'balance_due'),
  '2275.00 227.50 158.40 2205.90 300.00 1905.90');
select t_eq('status', (:'inv'::json->>'payment_status') || ' next ' || (:'inv'::json->>'next_due_date') || ' amount ' || (:'inv'::json->>'next_amount'), 'partial next 2026-11-15 amount 200.00');
select t_eq('session', :'inv'::json->>'session_name', 'Wedding');
select t_eq('line totals', (select string_agg((l->>'title') || '=' || (l->>'line_total'), ', ') from json_array_elements(:'inv'::json->'line_items') l), 'Wedding=2200.00, Travel=75.00');
select t_eq('schedule', (select string_agg((r->>'sequence') || ':' || (r->>'row_status') || ':' || (r->>'allocated'), ' ') from json_array_elements(:'inv'::json->'schedule') r), '1:partial:300.00 2:unpaid:0.00');
select t_eq('payments without notes', (select string_agg(json_object_keys_list, ',') from (select string_agg(k, ',' order by k) as json_object_keys_list from json_array_elements(:'inv'::json->'payments') p, json_object_keys(p) k) z), 'amount,method,paid_date');
select t_eq('invoice platform override, value trimmed', (:'inv'::json->>'pay_platform') || ' ' || (:'inv'::json->>'pay_value'), 'zelle nick@example.com');

select (select x from json_array_elements(:'d'::json->'invoices') x where x->>'invoice_number' = '1002') as inv2 \gset
select t_eq('paid invoice: default platform, nothing next', (:'inv2'::json->>'pay_platform') || ' ' || (:'inv2'::json->>'payment_status') || ' ' || (:'inv2'::json->>'next_amount'), 'venmo paid 0.00');
select t_eq('standalone has no session', coalesce(:'inv2'::json->>'session_name', 'null'), 'null');

\echo '── password gate still applies'
update clients set portal_password_hash = extensions.crypt('secret', extensions.gen_salt('bf')) where id = 'c1000000-0000-0000-0000-000000000001';
set role anon;
select t_eq('no password -> gate only', (select get_client_portal_data('tok-ava', null)::text), '{"password_required" : true, "locked" : false}');
select t_eq('wrong password -> no invoices', (get_client_portal_data('tok-ava', 'nope')::json->'invoices') is null, true);
select t_eq('right password -> invoices', json_array_length(get_client_portal_data('tok-ava', 'secret')::json->'invoices'), 2);
select t_eq('other client sees only theirs', (select string_agg(x->>'invoice_number', ',') from json_array_elements(get_client_portal_data('tok-ben', null)::json->'invoices') x), '1005');
select t_eq('bad token -> null', get_client_portal_data('nope', null) is null, true);
reset role;

\echo 'ALL 250 TESTS PASSED'
