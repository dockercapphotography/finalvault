-- 114_migrate_session_money.sql
-- v1.6.0 step 6: turn the old per-session money fields into invoices.
--
-- Before v1.6.0 a session carried its money directly (session_fee,
-- retainer_amount, retainer_paid, balance_due, balance_due_date,
-- payment_status). The app now reads invoices only (step 4), so each
-- session with an amount gets one invoice that says the same thing:
--
--   amount      = session_fee, falling back to balance_due (skipped if
--                 neither is a positive number)
--   invoice     = sent, one non-taxable line titled with the session name,
--                 due date = balance_due_date, created_at = the session's
--   paid        = payment_status 'paid': payments for the full amount, dated
--                 least(session_date, updated_at). With a retainer smaller
--                 than the amount: two payments (retainer, then balance).
--   unpaid      = with a retainer smaller than the amount: a two-row
--                 schedule (retainer due on the session's created date, the
--                 rest due balance_due_date); retainer_paid adds a payment
--                 for the retainer. Without a retainer: no schedule.
--   numbering   = per photographer, the lowest free numbers from 1001, in
--                 session order (session_date, created_at, id); the counter
--                 then continues after the highest number in use.
--
-- Re-runnable: a session that already has any invoice is skipped, so this
-- can run now and again at release. Sessions without a client are skipped
-- (an invoice needs one). A session that fails is reported and skipped;
-- the rest still migrate. The old session columns are left untouched.
--
-- Run in the SQL Editor (as postgres). The last statement lists what
-- happened to every session that had money on it.
--
-- Run after: 113_mobile_nav_items.sql

begin;

drop table if exists fv_money_migration_report;
create temp table fv_money_migration_report (
  photographer_id uuid,
  session_id      uuid,
  session_name    text,
  outcome         text,
  invoice_number  integer,
  amount          numeric(12,2),
  paid            numeric(12,2),
  detail          text
) on commit preserve rows;

do $$
declare
  s            record;
  v_amount     numeric(12,2);
  v_retainer   numeric(12,2);
  v_paid_date  date;
  v_number     integer;
  v_invoice_id uuid;
  v_paid       numeric(12,2);
  v_detail     text;
begin
  for s in
    select se.*
      from sessions se
     where coalesce(se.session_fee, 0) > 0
        or coalesce(se.balance_due, 0) > 0
        or se.payment_status = 'paid'
        or coalesce(se.retainer_amount, 0) > 0
     order by se.photographer_id, se.session_date nulls last, se.created_at, se.id
  loop
    if exists (select 1 from invoices i where i.session_id = s.id) then
      insert into fv_money_migration_report values
        (s.photographer_id, s.id, s.name, 'skipped', null, null, null, 'already has an invoice');
      continue;
    end if;

    v_amount := case when coalesce(s.session_fee, 0) > 0 then s.session_fee
                     when coalesce(s.balance_due, 0) > 0 then s.balance_due end;
    if v_amount is null then
      insert into fv_money_migration_report values
        (s.photographer_id, s.id, s.name, 'skipped', null, null, null,
         'no amount (fee and balance empty), payment_status ' || coalesce(s.payment_status, 'null'));
      continue;
    end if;
    if s.client_id is null then
      insert into fv_money_migration_report values
        (s.photographer_id, s.id, s.name, 'skipped', null, v_amount, null, 'no client on the session');
      continue;
    end if;

    v_retainer := case when coalesce(s.retainer_amount, 0) > 0 and s.retainer_amount < v_amount
                       then s.retainer_amount end;
    v_paid_date := least(coalesce(s.session_date, s.updated_at::date), s.updated_at::date);
    v_paid := 0;
    v_detail := null;

    begin
      -- Lowest free number from 1001 for this photographer. The insert
      -- trigger always takes the counter's value, so point the counter at it.
      select min(n) into v_number
        from generate_series(1001, 1001 + (select count(*) from invoices i where i.photographer_id = s.photographer_id)) n
       where not exists (select 1 from invoices i
                          where i.photographer_id = s.photographer_id and i.invoice_number = n);
      insert into invoice_number_counters (photographer_id, next_number)
        values (s.photographer_id, v_number)
        on conflict (photographer_id) do update set next_number = excluded.next_number;

      insert into invoices (photographer_id, client_id, session_id, status, due_date, created_at)
        values (s.photographer_id, s.client_id, s.id, 'sent', s.balance_due_date, s.created_at)
        returning id, invoice_number into v_invoice_id, v_number;

      insert into invoice_line_items (invoice_id, title, quantity, unit_price, taxable, sort_order)
        values (v_invoice_id, coalesce(nullif(btrim(s.name), ''), 'Session'), 1, v_amount, false, 0);

      if s.payment_status = 'paid' then
        if v_retainer is not null then
          insert into invoice_payments (invoice_id, amount, paid_date, note) values
            (v_invoice_id, v_retainer, v_paid_date, 'Retainer (imported from session)'),
            (v_invoice_id, v_amount - v_retainer, v_paid_date, 'Balance (imported from session)');
          v_detail := 'paid: retainer + balance';
        else
          insert into invoice_payments (invoice_id, amount, paid_date, note)
            values (v_invoice_id, v_amount, v_paid_date, 'Imported from session');
          v_detail := 'paid in full';
        end if;
        v_paid := v_amount;
      elsif v_retainer is not null then
        insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date) values
          (v_invoice_id, 1, v_retainer, s.created_at::date),
          (v_invoice_id, 2, v_amount - v_retainer, s.balance_due_date);
        if s.retainer_paid then
          insert into invoice_payments (invoice_id, amount, paid_date, note)
            values (v_invoice_id, v_retainer, least(s.created_at::date, s.updated_at::date), 'Retainer (imported from session)');
          v_paid := v_retainer;
          v_detail := 'unpaid: schedule, retainer paid';
        else
          v_detail := 'unpaid: schedule, nothing paid';
        end if;
      else
        v_detail := 'unpaid';
      end if;

      insert into fv_money_migration_report values
        (s.photographer_id, s.id, s.name, 'migrated', v_number, v_amount, v_paid, v_detail);
    exception when others then
      insert into fv_money_migration_report values
        (s.photographer_id, s.id, s.name, 'FAILED', null, v_amount, null, sqlerrm);
    end;
  end loop;

  -- Counters continue after the highest number in use.
  update invoice_number_counters c
     set next_number = m.max_number + 1
    from (select photographer_id, max(invoice_number) as max_number
            from invoices group by photographer_id) m
   where m.photographer_id = c.photographer_id;
end $$;

commit;

select r.outcome, r.invoice_number, r.session_name, r.amount, r.paid, r.detail,
       r.photographer_id, r.session_id
  from fv_money_migration_report r
 order by r.photographer_id, r.outcome desc, r.invoice_number nulls last, r.session_name;
