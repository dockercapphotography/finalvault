-- 121_fix_booking_invoice_permissions.sql
-- v1.6.0 hotfix for 120: public bookings failed with
-- "permission denied for view invoice_totals".
--
-- The "schedule must add up to the total" check (109) is a DEFERRED
-- constraint trigger: it runs at COMMIT, after the booking function has
-- returned -- so it runs as the caller (anon on the public booking page),
-- not as the function's owner, and anon can't read invoice_totals. A failed
-- check at commit can't be caught inside the booking function, so the whole
-- booking was rolled back whenever a draft invoice with a schedule was made.
--
-- Fix: the check runs as its owner (SECURITY DEFINER, fixed search_path),
-- like the numbering trigger already does. It only reads the total and
-- schedule of the invoice whose rows just changed, and only raises an
-- error; it never returns data.
--
-- Run after: 120_booking_invoices.sql

begin;

alter function public.fv_invoice_schedule_sum_check() security definer;
alter function public.fv_invoice_schedule_sum_check() set search_path = public;
revoke all on function public.fv_invoice_schedule_sum_check() from public, anon;

commit;

-- Verify (expect security_definer = true):
-- select prosecdef as security_definer, proconfig from pg_proc where proname = 'fv_invoice_schedule_sum_check';
