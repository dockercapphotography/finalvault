-- 119_contract_invoice_variables.sql
-- v1.6.0 step 10: contract templates move from the old session money
-- variables to invoice variables.
--
-- The session fee fields are no longer written (step 4), so templates using
-- them would fill in blanks on new sessions. Three variables have a clean
-- invoice equivalent and are swapped in every saved template:
--
--   {{session_fee}}       -> {{invoice_total}}
--   {{balance_due}}       -> {{invoice_balance_due}}
--   {{balance_due_date}}  -> {{invoice_due_date}}
--
-- {{retainer_amount}} has no safe automatic equivalent (an invoice can have
-- any number of installments, or none), so it is left in place. The app
-- flags those templates in Account -> Templates, and {{invoice_first_payment}}
-- is offered as the usual replacement.
--
-- Contracts already sent are not touched: their text was filled in when
-- they were sent.
--
-- Re-runnable: a second run finds nothing left to swap.
--
-- Run after: 118_invoice_emails.sql

begin;

update public.contract_templates
   set body = replace(replace(replace(body,
         '{{session_fee}}', '{{invoice_total}}'),
         '{{balance_due_date}}', '{{invoice_due_date}}'),
         '{{balance_due}}', '{{invoice_balance_due}}'),
       updated_at = now()
 where body like '%{{session\_fee}}%'
    or body like '%{{balance\_due}}%'
    or body like '%{{balance\_due\_date}}%';

commit;

-- Templates that still need a manual look (expect: only ones using
-- {{retainer_amount}}):
select t.photographer_id, t.name,
       (t.body like '%{{retainer\_amount}}%') as uses_retainer_amount
  from public.contract_templates t
 where t.body like '%{{retainer\_amount}}%'
    or t.body like '%{{session\_fee}}%'
    or t.body like '%{{balance\_due}}%'
    or t.body like '%{{balance\_due\_date}}%'
 order by t.photographer_id, t.name;
