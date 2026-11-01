-- 116_backdate_migrated_invoices.sql
-- v1.6.0 step 6 follow-up: give invoices created by 114 a believable
-- "Sent" date.
--
-- 114 copies the session's created_at onto each invoice it makes, but the
-- invoice insert trigger stamps sent_at with the time the migration ran
-- (and the update trigger never lets sent_at change). So migrated invoices
-- read "Sent Oct 31, 2026" in the portal even for an August shoot. This
-- sets sent_at to the invoice's created_at (= the session's created date).
--
-- Which invoices: sent, attached to a session, and created_at exactly equal
-- to that session's created_at -- only 114 produces that (the app creates
-- the invoice in a separate request, so the timestamps always differ).
-- Re-runnable: run it again after re-running 114 at release.
--
-- The update trigger is switched off for this one statement only, inside
-- the transaction; if anything fails, the rollback switches it back on.
--
-- Run after: 115_portal_invoices.sql

begin;

alter table public.invoices disable trigger invoices_before_update;

update public.invoices i
   set sent_at = i.created_at
  from public.sessions s
 where s.id = i.session_id
   and i.status = 'sent'
   and i.created_at = s.created_at
   and i.sent_at is distinct from i.created_at;

-- Run the deferred schedule-total check now; Postgres won't re-enable a
-- trigger while checks are still queued for the table.
set constraints all immediate;

alter table public.invoices enable trigger invoices_before_update;

commit;

-- Check (expect every migrated invoice, sent date = session created date):
select i.photographer_id, i.invoice_number, s.name as session, i.sent_at::date as sent, i.created_at::date as created
  from public.invoices i
  join public.sessions s on s.id = i.session_id
 where i.created_at = s.created_at
 order by i.photographer_id, i.invoice_number;
