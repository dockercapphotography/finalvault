-- Behaviour tests for 112 (invoice templates). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_fail(p_sql text, p_expect text) returns text language plpgsql as $$
begin
  begin execute p_sql; execute 'set constraints all immediate';
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
grant execute on function t_fail(text, text), t_eq(text, anyelement, anyelement) to authenticated;

insert into photographers (id) values ('99999999-0000-0000-0000-000000000001'), ('88888888-0000-0000-0000-000000000001');
update invoice_catalog_items set default_unit_price = 350 where name = 'Session Fee';
update invoice_catalog_items set default_unit_price = 0.65 where name = 'Travel Fee';
select id as fee from invoice_catalog_items where name = 'Session Fee' and photographer_id = '99999999-0000-0000-0000-000000000001' \gset
select id as travel from invoice_catalog_items where name = 'Travel Fee' and photographer_id = '99999999-0000-0000-0000-000000000001' \gset
select id as reshoot from invoice_catalog_items where name = 'Reshoot Fee' and photographer_id = '99999999-0000-0000-0000-000000000001' \gset
select id as other_fee from invoice_catalog_items where name = 'Session Fee' and photographer_id = '88888888-0000-0000-0000-000000000001' \gset

set role authenticated;
set request.jwt.claim.sub = '99999999-0000-0000-0000-000000000001';

\echo '── save: same-as-catalog values follow the catalog, changed ones are kept'
select save_invoice_template(jsonb_build_object(
  'name', 'Full Wedding', 'tax_rate', 8, 'discount_rate', 10, 'notes', 'Thanks!',
  'items', jsonb_build_array(
    jsonb_build_object('catalog_item_id', :'fee', 'title', 'Session Fee', 'unit_price', 350, 'quantity', 2, 'taxable', true),
    jsonb_build_object('catalog_item_id', :'travel', 'title', 'Travel Fee', 'unit_price', 0.80, 'quantity', 40, 'taxable', false),
    jsonb_build_object('title', 'Album', 'description', '10x10 linen', 'unit_price', 300, 'quantity', 1, 'taxable', true)),
  'schedule', '[{"percent": 50, "due_rule": "on_create"}, {"percent": 50, "due_rule": "before_session", "due_days": 14}]'::jsonb)) as tid \gset
select t_eq('fee line stores nothing but quantity', (select (title, unit_price, taxable)::text from invoice_template_items where template_id = :'tid' and catalog_item_id = :'fee'), '(,,)');
select t_eq('travel price override stored', (select unit_price from invoice_template_items where template_id = :'tid' and catalog_item_id = :'travel'), 0.80::numeric);
select t_eq('travel taxable equal to catalog default -> follows', (select taxable from invoice_template_items where template_id = :'tid' and catalog_item_id = :'travel'), null::boolean);
select t_eq('resolved prices', (select string_agg(title || '=' || unit_price || '/' || price_overridden, ', ' order by sort_order) from invoice_template_items_resolved where template_id = :'tid'),
  'Session Fee=350.00/false, Travel Fee=0.80/true, Album=300.00/true');
select t_eq('schedule saved', (select string_agg(percent || ' ' || due_rule || ' ' || due_days, '; ' order by sequence) from invoice_template_schedule where template_id = :'tid'),
  '50.000 on_create 0; 50.000 before_session 14');

\echo '── catalog changes reach lines that follow it, not overridden ones'
update invoice_catalog_items set default_unit_price = 400, name = 'Session Fee (2027)' where id = :'fee';
update invoice_catalog_items set default_unit_price = 0.70 where id = :'travel';
select t_eq('fee follows the catalog', (select title || '=' || unit_price from invoice_template_items_resolved where template_id = :'tid' and catalog_item_id = :'fee'), 'Session Fee (2027)=400.00');
select t_eq('travel keeps its override', (select unit_price from invoice_template_items_resolved where template_id = :'tid' and catalog_item_id = :'travel'), 0.80::numeric);
-- setting the override back to the catalog price makes it follow again
select save_invoice_template(jsonb_build_object('id', :'tid', 'name', 'Full Wedding',
  'items', jsonb_build_array(jsonb_build_object('catalog_item_id', :'travel', 'unit_price', 0.70, 'quantity', 40))));
select t_eq('back to following', (select price_overridden from invoice_template_items_resolved where template_id = :'tid'), false);
select t_eq('rates cleared when omitted', (select coalesce(tax_rate::text, 'null') from invoice_templates where id = :'tid'), 'null');
select t_eq('schedule kept when omitted', (select count(*) from invoice_template_schedule where template_id = :'tid'), 2::bigint);

\echo '── rules'
select t_fail($$select save_invoice_template('{"name":"Bad","schedule":[{"percent":60},{"percent":30}]}'::jsonb)$$, 'add up to 90');
select t_fail($$select save_invoice_template('{"name":"Bad","items":[{"title":"Custom","quantity":1}]}'::jsonb)$$, 'invoice_template_items_custom_values');
select t_fail($$select save_invoice_template('{"name":"   "}'::jsonb)$$, 'check constraint');
select t_fail(format($$select save_invoice_template(jsonb_build_object('name', 'X', 'items', jsonb_build_array(jsonb_build_object('catalog_item_id', %L, 'quantity', 1))))$$, :'other_fee'), 'doesn''t belong');
select t_fail($$select save_invoice_template('{"name":"Bad","schedule":[{"percent":100,"due_rule":"whenever"}]}'::jsonb)$$, 'check constraint');
select save_invoice_template(jsonb_build_object('name', 'Uses reshoot', 'items', jsonb_build_array(jsonb_build_object('catalog_item_id', :'reshoot', 'quantity', 1)))) as t2 \gset
select t_fail(format($$delete from invoice_catalog_items where id = %L$$, :'reshoot'), 'used in an invoice template');
delete from invoice_templates where id = :'t2';
delete from invoice_catalog_items where id = :'reshoot';
select t_eq('unused again -> deletable', (select count(*) from invoice_catalog_items where id = :'reshoot'), 0::bigint);

\echo '── other accounts and roles'
set request.jwt.claim.sub = '88888888-0000-0000-0000-000000000001';
select t_eq('B sees no templates', (select count(*) from invoice_templates), 0::bigint);
select t_eq('B sees no resolved lines', (select count(*) from invoice_template_items_resolved), 0::bigint);
select t_fail(format($$select save_invoice_template(jsonb_build_object('id', %L, 'name', 'Mine now'))$$, :'tid'), 'not found');
reset role;
set role anon;
select t_fail($$select * from invoice_templates$$, 'permission denied');
select t_fail($$select * from invoice_template_items_resolved$$, 'permission denied');
reset role;
delete from photographers where id = '99999999-0000-0000-0000-000000000001';
select t_eq('account deletion removes templates', (select count(*) from invoice_templates), 0::bigint);
\echo 'ALL 112 TESTS PASSED'
