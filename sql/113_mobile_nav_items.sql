-- 113_mobile_nav_items.sql
-- v1.6.0: photographers pick which pages sit on the mobile bottom bar.
--
-- The bar shows up to 4 picked pages plus a "More" button; everything not
-- picked lives in the More sheet. null = the default set, decided by the
-- app (Galleries, Sessions, Clients, Financials), so a new page added in a
-- later release can appear for everyone who never customized the bar.
--
-- Saved on the account so the choice follows the photographer to any
-- phone. Written by the photographer through the existing
-- "Photographers can update own profile" policy, like
-- default_invoice_platform (107).
--
-- Run after: 112_invoice_templates.sql

begin;

alter table public.photographers
  add column if not exists mobile_nav_items text[];

alter table public.photographers
  drop constraint if exists photographers_mobile_nav_items_check;

alter table public.photographers
  add constraint photographers_mobile_nav_items_check check (
    mobile_nav_items is null
    or (
      cardinality(mobile_nav_items) between 1 and 4
      and mobile_nav_items <@ array['galleries', 'clients', 'sessions', 'financials', 'bookmarked', 'account']::text[]
      and array_position(mobile_nav_items, null) is null
    )
  );

commit;

-- Verify (expect one row, data_type ARRAY):
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'photographers'
--    and column_name = 'mobile_nav_items';

-- Rollback:
-- alter table public.photographers drop constraint if exists photographers_mobile_nav_items_check;
-- alter table public.photographers drop column if exists mobile_nav_items;
