-- 109_invoice_rules.sql
-- v1.6.0 Invoicing, part 3 of 4: rules the database enforces, not just the UI.
--
--   * Invoice numbers: per photographer from 1001, safe under concurrency.
--   * Status: draft -> sent -> void (or draft -> void); void is final,
--     sent never returns to draft. Only drafts with no payments can be deleted.
--   * Edit lock from the first logged payment: line items, tax, discount,
--     client and session lock; due date, platform and notes stay editable.
--   * Catalog: an item used on an invoice is archived, not deleted.
--   * Schedule: payments fill installments in order; a paid installment
--     locks; the schedule must add up to the invoice total (checked at
--     commit, so the editor saves through one transaction).
--
-- Deletes of whole accounts, sessions and clients still work: the guards
-- step aside when the parent row is already gone, and detaching a deleted
-- client or session (set to null) is always allowed.

begin;

-- Roles that act as a person through the Data API. Anything else (the SQL
-- Editor, service-role Edge Functions and test cleanup, foreign-key actions)
-- is treated as an administrator for the delete rule only.
create or replace function public.fv_is_end_user()
returns boolean language sql stable set search_path = public as $$
  select current_user in ('authenticated', 'anon')
$$;

-- ── invoices: before insert ──────────────────────────────────────────────
create or replace function public.fv_invoices_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is null then
    raise exception 'An invoice needs a client.' using errcode = 'check_violation';
  end if;
  if new.status = 'void' then
    raise exception 'An invoice can''t be created as void.' using errcode = 'check_violation';
  end if;

  -- Number: the counter row lock queues concurrent inserts for the same
  -- photographer. Any number the caller sent is ignored.
  insert into invoice_number_counters (photographer_id) values (new.photographer_id)
    on conflict (photographer_id) do nothing;
  update invoice_number_counters
     set next_number = next_number + 1
   where photographer_id = new.photographer_id
  returning next_number - 1 into new.invoice_number;

  -- Who it was billed to, kept if the client is later deleted. Scoped to
  -- the invoice's photographer; the composite foreign key rejects a client
  -- belonging to anyone else.
  select nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email
    into new.client_name, new.client_email
    from clients c
   where c.id = new.client_id and c.photographer_id = new.photographer_id;

  new.sent_at   := case when new.status = 'sent' then now() end;
  new.voided_at := null;
  return new;
end $$;

create trigger invoices_before_insert before insert on public.invoices
  for each row execute function public.fv_invoices_before_insert();

-- ── invoices: before update ──────────────────────────────────────────────
create or replace function public.fv_invoices_before_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v_has_payments boolean;
  v_client_changed  boolean := new.client_id  is distinct from old.client_id  and new.client_id  is not null;
  v_session_changed boolean := new.session_id is distinct from old.session_id and new.session_id is not null;
begin
  if new.photographer_id <> old.photographer_id or new.invoice_number <> old.invoice_number then
    raise exception 'An invoice''s owner and number can''t be changed.' using errcode = 'check_violation';
  end if;

  -- Timestamps and the billed-to copy are managed here, not by callers.
  new.sent_at      := old.sent_at;
  new.voided_at    := old.voided_at;
  new.client_name  := old.client_name;
  new.client_email := old.client_email;

  -- Status transitions
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'sent' then
      new.sent_at := now();
    elsif old.status in ('draft', 'sent') and new.status = 'void' then
      new.voided_at := now();
    elsif old.status = 'sent' and new.status = 'draft' then
      raise exception 'A sent invoice can''t go back to draft. Void it and create a new one.' using errcode = 'check_violation';
    else
      raise exception 'A void invoice can''t be changed.' using errcode = 'check_violation';
    end if;
  end if;

  -- Void is final: only notes can change (plus detaching a deleted client
  -- or session, which arrives here as a change to null).
  if old.status = 'void' then
    if new.due_date is distinct from old.due_date
       or new.payment_platform is distinct from old.payment_platform
       or new.tax_rate is distinct from old.tax_rate
       or new.discount_rate is distinct from old.discount_rate
       or v_client_changed or v_session_changed then
      raise exception 'A void invoice can''t be changed.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Edit lock once a payment is logged
  select exists (select 1 from invoice_payments p where p.invoice_id = old.id) into v_has_payments;
  if v_has_payments and (
       new.tax_rate is distinct from old.tax_rate
    or new.discount_rate is distinct from old.discount_rate
    or v_client_changed or v_session_changed) then
    raise exception 'This invoice has a payment logged, so its client, session, tax and discount are locked. Void it and create a new one to change them.'
      using errcode = 'check_violation';
  end if;

  -- New client: refresh the billed-to copy (RLS limits this to own clients;
  -- the composite foreign key does the same for every caller).
  if v_client_changed then
    select nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email
      into new.client_name, new.client_email
      from clients c
     where c.id = new.client_id and c.photographer_id = new.photographer_id;
  end if;

  return new;
end $$;

create trigger invoices_before_update before update on public.invoices
  for each row execute function public.fv_invoices_before_update();

-- ── invoices: before delete ──────────────────────────────────────────────
create or replace function public.fv_invoices_before_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.fv_is_end_user() then
    return old;  -- account deletion, service-role cleanup, SQL Editor
  end if;
  if old.status <> 'draft' then
    raise exception 'Only draft invoices can be deleted. Void a sent invoice instead.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from invoice_payments p where p.invoice_id = old.id) then
    raise exception 'This draft has a payment logged, so it can''t be deleted.' using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger invoices_before_delete before delete on public.invoices
  for each row execute function public.fv_invoices_before_delete();

-- ── line items: edit lock ────────────────────────────────────────────────
create or replace function public.fv_invoice_line_items_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_inv record;
begin
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'A line item can''t move to another invoice.' using errcode = 'check_violation';
  end if;

  select i.status, i.photographer_id into v_inv from invoices i where i.id = v_invoice_id;
  if not found then
    -- Parent already deleted (cascade); on insert, the foreign key reports it.
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_inv.status = 'void' then
    raise exception 'A void invoice can''t be changed.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from invoice_payments p where p.invoice_id = v_invoice_id) then
    raise exception 'Line items are locked because a payment has been logged. Void and reissue to make changes.'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' and new.catalog_item_id is not null
     and (tg_op = 'INSERT' or new.catalog_item_id is distinct from old.catalog_item_id)
     and not exists (select 1 from invoice_catalog_items ci
                      where ci.id = new.catalog_item_id and ci.photographer_id = v_inv.photographer_id) then
    raise exception 'That catalog item doesn''t belong to this account.' using errcode = 'foreign_key_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger invoice_line_items_guard before insert or update or delete on public.invoice_line_items
  for each row execute function public.fv_invoice_line_items_guard();

-- ── payments: none on a void invoice ─────────────────────────────────────
create or replace function public.fv_invoice_payments_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_status text;
begin
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'A payment can''t move to another invoice.' using errcode = 'check_violation';
  end if;
  select i.status into v_status from invoices i where i.id = v_invoice_id;
  if found and v_status = 'void' then
    raise exception 'Payments on a void invoice can''t be added or changed.' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger invoice_payments_guard before insert or update or delete on public.invoice_payments
  for each row execute function public.fv_invoice_payments_guard();

-- ── schedule: paid installments lock ─────────────────────────────────────
create or replace function public.fv_invoice_schedule_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_status text;
  v_alloc numeric(12,2);
begin
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'An installment can''t move to another invoice.' using errcode = 'check_violation';
  end if;

  select i.status into v_status from invoices i where i.id = v_invoice_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_status = 'void' then
    raise exception 'A void invoice can''t be changed.' using errcode = 'check_violation';
  end if;

  -- What's already been paid toward the existing row (allocation math lives in 108).
  if tg_op in ('UPDATE', 'DELETE') then
    select ss.allocated into v_alloc from invoice_schedule_status ss where ss.schedule_id = old.id;
    v_alloc := coalesce(v_alloc, 0);

    if tg_op = 'DELETE' and v_alloc > 0 then
      raise exception 'Installment % has payments against it and can''t be removed.', old.sequence
        using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' then
      if v_alloc >= old.amount and (new.amount <> old.amount or new.due_date is distinct from old.due_date) then
        raise exception 'Installment % is paid and locked.', old.sequence using errcode = 'check_violation';
      end if;
      if v_alloc > 0 and new.sequence <> old.sequence then
        raise exception 'Installment % has payments against it and can''t be reordered.', old.sequence
          using errcode = 'check_violation';
      end if;
      if new.amount < v_alloc then
        raise exception 'Installment % already has % paid against it.', old.sequence, v_alloc
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A new or moved row can't go ahead of an installment that has payments,
  -- or those payments would shift onto it.
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.sequence <> old.sequence) then
    if exists (select 1 from invoice_schedule_status ss
                where ss.invoice_id = new.invoice_id
                  and ss.sequence > new.sequence
                  and ss.allocated > 0
                  and (tg_op = 'INSERT' or ss.schedule_id <> old.id)) then
      raise exception 'An installment can''t be placed before one that already has payments.'
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger invoice_schedule_guard before insert or update or delete on public.invoice_payment_schedule
  for each row execute function public.fv_invoice_schedule_guard();

-- ── catalog: a used item is archived, not deleted ────────────────────────
create or replace function public.fv_invoice_catalog_items_before_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.fv_is_end_user()
     and exists (select 1 from invoice_line_items li where li.catalog_item_id = old.id) then
    raise exception '"%" is used on an invoice, so it can''t be deleted. Archive it instead.', old.name
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end $$;

create trigger invoice_catalog_items_before_delete before delete on public.invoice_catalog_items
  for each row execute function public.fv_invoice_catalog_items_before_delete();

-- ── schedule must add up to the total (checked at commit) ────────────────
create or replace function public.fv_invoice_schedule_sum_check()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice_id uuid;
  v_total numeric(12,2);
  v_status text;
  v_sum numeric(12,2);
begin
  if tg_table_name = 'invoices' then
    v_invoice_id := new.id;
  elsif tg_op = 'DELETE' then
    v_invoice_id := old.invoice_id;
  else
    v_invoice_id := new.invoice_id;
  end if;

  select t.total, t.status into v_total, v_status from invoice_totals t where t.invoice_id = v_invoice_id;
  if not found or v_status = 'void' then
    return null;
  end if;

  select sum(s.amount) into v_sum from invoice_payment_schedule s where s.invoice_id = v_invoice_id;
  if v_sum is not null and v_sum <> v_total then
    raise exception 'The payment schedule adds up to % but the invoice total is %.', v_sum, v_total
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger invoice_schedule_sum_check
  after insert or update or delete on public.invoice_payment_schedule
  deferrable initially deferred
  for each row execute function public.fv_invoice_schedule_sum_check();
create constraint trigger invoice_schedule_sum_check
  after insert or update or delete on public.invoice_line_items
  deferrable initially deferred
  for each row execute function public.fv_invoice_schedule_sum_check();
create constraint trigger invoice_schedule_sum_check
  after update on public.invoices
  deferrable initially deferred
  for each row execute function public.fv_invoice_schedule_sum_check();

-- Trigger functions aren't callable directly; the helper is harmless but
-- isn't needed by API callers either.
revoke all on function public.fv_is_end_user() from public, anon;
grant execute on function public.fv_is_end_user() to authenticated, service_role;

commit;

-- ── Rollback (run 110 rollback first) ────────────────────────────────────
-- begin;
-- drop trigger if exists invoice_schedule_sum_check on public.invoices;
-- drop trigger if exists invoice_schedule_sum_check on public.invoice_line_items;
-- drop trigger if exists invoice_schedule_sum_check on public.invoice_payment_schedule;
-- drop trigger if exists invoice_catalog_items_before_delete on public.invoice_catalog_items;
-- drop trigger if exists invoice_schedule_guard on public.invoice_payment_schedule;
-- drop trigger if exists invoice_payments_guard on public.invoice_payments;
-- drop trigger if exists invoice_line_items_guard on public.invoice_line_items;
-- drop trigger if exists invoices_before_delete on public.invoices;
-- drop trigger if exists invoices_before_update on public.invoices;
-- drop trigger if exists invoices_before_insert on public.invoices;
-- drop function if exists public.fv_invoice_schedule_sum_check(), public.fv_invoice_catalog_items_before_delete(),
--   public.fv_invoice_schedule_guard(),
--   public.fv_invoice_payments_guard(), public.fv_invoice_line_items_guard(),
--   public.fv_invoices_before_delete(), public.fv_invoices_before_update(),
--   public.fv_invoices_before_insert(), public.fv_is_end_user();
-- commit;
