-- 117_invoice_logo.sql
-- v1.6.0 step 8: which logo goes on invoice PDFs (and, in step 9, emails).
--
-- The account logo (photographers.logo_r2_key) is the one meant for dark
-- backgrounds -- often a white wordmark, unreadable on a white invoice. So
-- invoices get their own optional "logo for light backgrounds", uploaded
-- in Account -> Invoicing (always stored as PNG so the PDF can embed it),
-- plus a choice of which logo to use:
--
--   invoice_logo_mode  null   = automatic: the light-background logo if one
--                               is uploaded, otherwise the account logo
--                      'main' = always the account logo
--                      'none' = no logo, business name only
--
-- Written by the photographer through the existing "Photographers can
-- update own profile" policy, like default_invoice_platform (107).
--
-- Run after: 116_backdate_migrated_invoices.sql

begin;

alter table public.photographers
  add column if not exists invoice_logo_r2_key text,
  add column if not exists invoice_logo_mode text;

alter table public.photographers
  drop constraint if exists photographers_invoice_logo_mode_check;
alter table public.photographers
  add constraint photographers_invoice_logo_mode_check
  check (invoice_logo_mode is null or invoice_logo_mode in ('main', 'none'));

commit;

-- Verify (expect two rows):
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'photographers'
--    and column_name in ('invoice_logo_r2_key', 'invoice_logo_mode');

-- Rollback:
-- alter table public.photographers drop constraint if exists photographers_invoice_logo_mode_check;
-- alter table public.photographers drop column if exists invoice_logo_mode, drop column if exists invoice_logo_r2_key;
