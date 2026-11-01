-- 230: photographers.mobile_nav_items check constraint (113).
\set QUIET on
\pset tuples_only on
create temp table r (name text, ok boolean);

insert into photographers (id) values ('00000000-0000-0000-0000-0000000000a1');

create or replace function pg_temp.try(v text[]) returns boolean language plpgsql as $$
begin
  update photographers set mobile_nav_items = v where id = '00000000-0000-0000-0000-0000000000a1';
  return true;
exception when check_violation then return false;
end $$;

insert into r values
  ('null allowed', pg_temp.try(null)),
  ('4 valid allowed', pg_temp.try(array['galleries','sessions','clients','financials'])),
  ('1 valid allowed', pg_temp.try(array['account'])),
  ('empty rejected', not pg_temp.try(array[]::text[])),
  ('5 rejected', not pg_temp.try(array['galleries','sessions','clients','financials','account'])),
  ('unknown key rejected', not pg_temp.try(array['galleries','invoices'])),
  ('null element rejected', not pg_temp.try(array['galleries',null]));

select case when ok then 'PASS ' else 'FAIL ' end || name from r;
select count(*) filter (where ok) || '/' || count(*) || ' passed (230)' from r;
