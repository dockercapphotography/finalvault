-- 108_invoice_totals.sql
-- v1.6.0 Invoicing, part 2 of 4: every computed money value, defined once.
--
-- The dashboard, Session Detail, Sessions board, portal RPCs, PDF and
-- email functions all read these views; nothing recomputes the math.
-- security_invoker = true: photographers see only their own rows (RLS);
-- SECURITY DEFINER RPCs and service-role functions read them after their
-- own token checks.
--
-- Rounding: each line total is rounded to cents, then the discount and the
-- tax are each rounded once.
--   Wedding $2,200 (taxable) + Travel $75 (non-taxable), 10% off, 8% tax
--   -> subtotal 2,275.00, discount 227.50, taxable after discount 1,980.00,
--      tax 158.40, total 2,205.90

begin;

-- ── Per installment: payments fill rows in sequence order ────────────────
create view public.invoice_schedule_status
with (security_invoker = true) as
select
  x.schedule_id,
  x.invoice_id,
  x.sequence,
  x.amount,
  x.due_date,
  x.allocated,
  case when x.allocated <= 0      then 'unpaid'
       when x.allocated < x.amount then 'partial'
       else 'paid' end                   as row_status,
  (x.allocated >= x.amount)             as is_locked
from (
  select
    s.id         as schedule_id,
    s.invoice_id,
    s.sequence,
    s.amount,
    s.due_date,
    greatest(0, least(
      s.amount,
      coalesce(p.amount_paid, 0)
        - (sum(s.amount) over (partition by s.invoice_id order by s.sequence) - s.amount)
    ))::numeric(12,2) as allocated
  from public.invoice_payment_schedule s
  left join (
    select invoice_id, sum(amount) as amount_paid
    from public.invoice_payments group by invoice_id
  ) p on p.invoice_id = s.invoice_id
) x;

-- ── Per invoice ──────────────────────────────────────────────────────────
create view public.invoice_totals
with (security_invoker = true) as
select
  i.id                       as invoice_id,
  i.photographer_id,
  i.client_id,
  i.session_id,
  i.invoice_number,
  i.status,
  i.due_date,
  m.subtotal,
  m.discount_amount,
  m.taxable_subtotal,
  m.taxable_after_discount,
  m.tax_amount,
  t.total,
  t.amount_paid,
  (t.total - t.amount_paid)  as balance_due,
  case when t.amount_paid <= 0      then 'unpaid'
       when t.amount_paid < t.total then 'partial'
       else 'paid' end            as payment_status,
  (coalesce(pay.payment_count, 0) > 0)  as has_payments,
  (sch.row_count > 0)        as has_schedule,
  d.next_due_date,
  (i.status = 'sent'
    and t.amount_paid < t.total
    and d.next_due_date < current_date) as is_overdue
from public.invoices i
left join (
  select invoice_id,
         sum(round(quantity * unit_price, 2))                                  as subtotal,
         sum(case when taxable then round(quantity * unit_price, 2) else 0 end) as taxable_subtotal
  from public.invoice_line_items group by invoice_id
) li on li.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as amount_paid, count(*) as payment_count
  from public.invoice_payments group by invoice_id
) pay on pay.invoice_id = i.id
left join lateral (
  select count(*) as row_count,
         min(ss.sequence) filter (where ss.row_status <> 'paid') as next_unpaid_seq
  from public.invoice_schedule_status ss
  where ss.invoice_id = i.id
) sch on true
cross join lateral (
  select
    coalesce(li.subtotal, 0)::numeric(12,2)                                         as subtotal,
    round(coalesce(li.subtotal, 0) * coalesce(i.discount_rate, 0) / 100, 2)         as discount_amount,
    coalesce(li.taxable_subtotal, 0)::numeric(12,2)                                 as taxable_subtotal,
    round(coalesce(li.taxable_subtotal, 0) * (1 - coalesce(i.discount_rate, 0) / 100), 2) as taxable_after_discount
) m0
cross join lateral (
  select m0.*,
         round(m0.taxable_after_discount * coalesce(i.tax_rate, 0) / 100, 2) as tax_amount
) m
cross join lateral (
  select (m.subtotal - m.discount_amount + m.tax_amount)::numeric(12,2) as total,
         coalesce(pay.amount_paid, 0)::numeric(12,2)                    as amount_paid
) t
cross join lateral (
  -- With a schedule: the first not-fully-paid installment's due date
  -- (falling back to the invoice's own due date). Without: the invoice's.
  select coalesce(
    (select ss.due_date from public.invoice_schedule_status ss
      where ss.invoice_id = i.id and ss.sequence = sch.next_unpaid_seq),
    i.due_date) as next_due_date
) d;

-- ── Per session (Sessions board badge and filter) ────────────────────────
-- Void invoices are ignored; drafts count, as the old fee badge did.
create view public.session_invoice_status
with (security_invoker = true) as
select
  session_id,
  photographer_id,
  count(*)            as invoice_count,
  sum(total)          as total,
  sum(amount_paid)    as amount_paid,
  sum(balance_due)    as balance_due,
  case when bool_and(payment_status = 'paid') then 'paid'
       when sum(amount_paid) > 0              then 'partial'
       else 'unpaid' end                       as payment_status,
  bool_or(is_overdue) as is_overdue
from public.invoice_totals
where status <> 'void' and session_id is not null
group by session_id, photographer_id;

revoke all on public.invoice_schedule_status, public.invoice_totals, public.session_invoice_status
  from public, anon;
grant select on public.invoice_schedule_status, public.invoice_totals, public.session_invoice_status
  to authenticated, service_role;

commit;

-- ── Rollback (run 110 and 109 rollbacks first) ───────────────────────────
-- begin;
-- drop view if exists public.session_invoice_status, public.invoice_totals, public.invoice_schedule_status;
-- commit;
