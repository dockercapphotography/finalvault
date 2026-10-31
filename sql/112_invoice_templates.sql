-- 112_invoice_templates.sql
-- v1.6.0 Invoicing: invoice templates ("Full Wedding": a package's lines,
-- tax, discount, notes and payment schedule pattern, applied in one go).
--
-- Template lines that come from the catalog follow it: each overridable
-- field (title, description, unit_price, unit_label, taxable) is NULL to
-- mean "use the catalog's current value", or holds the photographer's own
-- value. So a catalog price change reaches every template line that
-- didn't change its price, and the database records which lines did.
-- Custom lines (no catalog item) carry their own title and price.
--
-- The schedule pattern is percentages with a due rule, turned into amounts
-- and dates when the template is applied to an invoice:
--   on_create        due the day the invoice is created
--   after_create     N days after the invoice is created
--   before_session   N days before the session date
--   on_session       on the session date
--
-- Applying a template happens in the app (it fills the editor, which saves
-- through save_invoice); nothing here creates invoices.

begin;

-- ── Tables ───────────────────────────────────────────────────────────────
create table public.invoice_templates (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  notes           text,
  tax_rate        numeric(6,3) check (tax_rate between 0 and 100),
  discount_rate   numeric(6,3) check (discount_rate between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoice_templates_photographer_idx on public.invoice_templates (photographer_id, name);

create table public.invoice_template_items (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.invoice_templates(id) on delete cascade,
  -- CASCADE only matters for whole-account deletion: app users can't delete
  -- a catalog item that a template uses (trigger below), they archive it.
  catalog_item_id uuid references public.invoice_catalog_items(id) on delete cascade,
  title           text,          -- null = catalog's name
  description     text,          -- null = catalog's description
  unit_price      numeric(12,2) check (unit_price >= 0),   -- null = catalog's price
  unit_label      text,          -- null = catalog's unit
  taxable         boolean,       -- null = catalog's taxable default
  quantity        numeric(10,2) not null default 1 check (quantity > 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- A custom line has nothing to inherit from.
  constraint invoice_template_items_custom_values check (
    catalog_item_id is not null
    or (title is not null and length(btrim(title)) > 0 and unit_price is not null)
  )
);
create index invoice_template_items_template_idx on public.invoice_template_items (template_id, sort_order);
create index invoice_template_items_catalog_idx on public.invoice_template_items (catalog_item_id) where catalog_item_id is not null;

create table public.invoice_template_schedule (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.invoice_templates(id) on delete cascade,
  sequence    integer not null check (sequence >= 1),
  percent     numeric(6,3) not null check (percent > 0 and percent <= 100),
  due_rule    text not null default 'on_create'
              check (due_rule in ('on_create', 'after_create', 'before_session', 'on_session')),
  due_days    integer not null default 0 check (due_days between 0 and 3650),
  created_at  timestamptz not null default now(),
  constraint invoice_template_schedule_sequence_key unique (template_id, sequence)
);

create trigger set_updated_at before update on public.invoice_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoice_template_items
  for each row execute function public.set_updated_at();

-- ── Grants and RLS (authenticated + service_role only) ──────────────────
revoke all on public.invoice_templates, public.invoice_template_items, public.invoice_template_schedule from public, anon;
grant select, insert, update, delete on public.invoice_templates, public.invoice_template_items, public.invoice_template_schedule
  to authenticated, service_role;

alter table public.invoice_templates         enable row level security;
alter table public.invoice_template_items    enable row level security;
alter table public.invoice_template_schedule enable row level security;

create policy "Photographers manage own invoice templates" on public.invoice_templates
  for all to authenticated
  using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());

create policy "Photographers manage own invoice template items" on public.invoice_template_items
  for all to authenticated
  using (exists (select 1 from public.invoice_templates t where t.id = template_id and t.photographer_id = auth.uid()))
  with check (exists (select 1 from public.invoice_templates t where t.id = template_id and t.photographer_id = auth.uid()));

create policy "Photographers manage own invoice template schedules" on public.invoice_template_schedule
  for all to authenticated
  using (exists (select 1 from public.invoice_templates t where t.id = template_id and t.photographer_id = auth.uid()))
  with check (exists (select 1 from public.invoice_templates t where t.id = template_id and t.photographer_id = auth.uid()));

-- ── A template line can only use its own photographer's catalog ─────────
create or replace function public.fv_invoice_template_items_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.catalog_item_id is not null
     and (tg_op = 'INSERT' or new.catalog_item_id is distinct from old.catalog_item_id)
     and not exists (
       select 1 from invoice_catalog_items ci
         join invoice_templates t on t.photographer_id = ci.photographer_id
        where ci.id = new.catalog_item_id and t.id = new.template_id) then
    raise exception 'That catalog item doesn''t belong to this account.' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger invoice_template_items_guard before insert or update on public.invoice_template_items
  for each row execute function public.fv_invoice_template_items_guard();

-- ── Catalog delete rule now also covers templates (109's function) ──────
create or replace function public.fv_invoice_catalog_items_before_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.fv_is_end_user() then
    if exists (select 1 from invoice_line_items li where li.catalog_item_id = old.id) then
      raise exception '"%" is used on an invoice, so it can''t be deleted. Archive it instead.', old.name
        using errcode = 'foreign_key_violation';
    end if;
    if exists (select 1 from invoice_template_items ti where ti.catalog_item_id = old.id) then
      raise exception '"%" is used in an invoice template, so it can''t be deleted. Archive it, or remove it from the template first.', old.name
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  return old;
end $$;

-- ── Lines with the catalog's current values filled in ───────────────────
create view public.invoice_template_items_resolved
with (security_invoker = true) as
select
  ti.id,
  ti.template_id,
  ti.catalog_item_id,
  ti.quantity,
  ti.sort_order,
  coalesce(ti.title, ci.name)                     as title,
  coalesce(ti.description, ci.description)        as description,
  coalesce(ti.unit_price, ci.default_unit_price)  as unit_price,
  coalesce(ti.unit_label, ci.unit_label)          as unit_label,
  coalesce(ti.taxable, ci.taxable_default, true)  as taxable,
  -- What the photographer changed from the catalog (all true for custom lines).
  (ti.title is not null)       as title_overridden,
  (ti.description is not null) as description_overridden,
  (ti.unit_price is not null)  as price_overridden,
  (ti.unit_label is not null)  as unit_overridden,
  (ti.taxable is not null)     as taxable_overridden,
  coalesce(ci.active, true)    as catalog_active
from public.invoice_template_items ti
left join public.invoice_catalog_items ci on ci.id = ti.catalog_item_id;

revoke all on public.invoice_template_items_resolved from public, anon;
grant select on public.invoice_template_items_resolved to authenticated, service_role;

-- ── Save a template, its lines and its schedule in one transaction ──────
-- p_template:
--   id, name, notes, tax_rate, discount_rate
--   items:    [{ catalog_item_id?, title?, description?, unit_price?, unit_label?, taxable?, quantity }]
--             For a catalog line, send only the fields that differ from the
--             catalog (others null/omitted); a field equal to the catalog's
--             current value is stored as null so it keeps following.
--   schedule: [{ percent, due_rule, due_days }]   [] or omitted = none
-- Lines and schedule are replaced wholesale (nothing references them).
create or replace function public.save_invoice_template(p_template jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_template->>'id', '')::uuid;
  v_uid uuid := auth.uid();
  v_sum numeric;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  if v_id is null then
    insert into invoice_templates (photographer_id, name, notes, tax_rate, discount_rate)
    values (v_uid, btrim(coalesce(p_template->>'name', '')),
            nullif(btrim(coalesce(p_template->>'notes', '')), ''),
            nullif(p_template->>'tax_rate', '')::numeric,
            nullif(p_template->>'discount_rate', '')::numeric)
    returning id into v_id;
  else
    update invoice_templates set
      name = btrim(coalesce(p_template->>'name', '')),
      notes = nullif(btrim(coalesce(p_template->>'notes', '')), ''),
      tax_rate = nullif(p_template->>'tax_rate', '')::numeric,
      discount_rate = nullif(p_template->>'discount_rate', '')::numeric
    where id = v_id;
    if not found then
      raise exception 'Template not found.' using errcode = 'no_data_found';
    end if;
  end if;

  if jsonb_typeof(p_template->'items') = 'array' then
    delete from invoice_template_items where template_id = v_id;
    insert into invoice_template_items
      (template_id, catalog_item_id, title, description, unit_price, unit_label, taxable, quantity, sort_order)
    select v_id, x.catalog_item_id,
           -- A value equal to the catalog's current one is stored as null
           -- ("follow the catalog").
           case when x.catalog_item_id is not null and x.title is not distinct from ci.name then null else x.title end,
           case when x.catalog_item_id is not null and x.description is not distinct from ci.description then null else x.description end,
           case when x.catalog_item_id is not null and x.unit_price is not distinct from ci.default_unit_price then null else x.unit_price end,
           case when x.catalog_item_id is not null and x.unit_label is not distinct from ci.unit_label then null else x.unit_label end,
           case when x.catalog_item_id is not null and x.taxable is not distinct from ci.taxable_default then null else x.taxable end,
           x.quantity, x.ord
      from (
        select nullif(i->>'catalog_item_id', '')::uuid                    as catalog_item_id,
               nullif(btrim(coalesce(i->>'title', '')), '')               as title,
               nullif(btrim(coalesce(i->>'description', '')), '')         as description,
               nullif(i->>'unit_price', '')::numeric(12,2)                as unit_price,
               nullif(btrim(coalesce(i->>'unit_label', '')), '')          as unit_label,
               (i->>'taxable')::boolean                                   as taxable,
               coalesce(nullif(i->>'quantity', '')::numeric, 1)::numeric(10,2) as quantity,
               ord::integer                                               as ord
          from jsonb_array_elements(p_template->'items') with ordinality as t(i, ord)
      ) x
      left join invoice_catalog_items ci on ci.id = x.catalog_item_id;
  end if;

  if jsonb_typeof(p_template->'schedule') = 'array' then
    delete from invoice_template_schedule where template_id = v_id;
    insert into invoice_template_schedule (template_id, sequence, percent, due_rule, due_days)
    select v_id, ord, (s->>'percent')::numeric,
           coalesce(nullif(s->>'due_rule', ''), 'on_create'),
           coalesce(nullif(s->>'due_days', '')::integer, 0)
      from jsonb_array_elements(p_template->'schedule') with ordinality as t(s, ord);

    select sum(percent) into v_sum from invoice_template_schedule where template_id = v_id;
    if v_sum is not null and v_sum <> 100 then
      raise exception 'The payment schedule percentages add up to %, not 100.', v_sum using errcode = 'check_violation';
    end if;
  end if;

  return v_id;
end $$;

revoke all on function public.save_invoice_template(jsonb) from public, anon;
grant execute on function public.save_invoice_template(jsonb) to authenticated, service_role;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.save_invoice_template(jsonb);
-- drop view if exists public.invoice_template_items_resolved;
-- create or replace function public.fv_invoice_catalog_items_before_delete()
-- returns trigger language plpgsql set search_path = public as $$
-- begin
--   if public.fv_is_end_user()
--      and exists (select 1 from invoice_line_items li where li.catalog_item_id = old.id) then
--     raise exception '"%" is used on an invoice, so it can''t be deleted. Archive it instead.', old.name
--       using errcode = 'foreign_key_violation';
--   end if;
--   return old;
-- end $$;
-- drop table if exists public.invoice_template_schedule, public.invoice_template_items, public.invoice_templates;
-- drop function if exists public.fv_invoice_template_items_guard();
-- commit;
