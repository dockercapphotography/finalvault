-- 111_save_invoice.sql
-- v1.6.0 Invoicing: editor saves in one transaction.
--
-- save_invoice(p_invoice jsonb) creates or updates an invoice together with
-- its line items and payment schedule. One call = one transaction, so the
-- "schedule must add up to the total" check (109, checked at commit) sees
-- the finished result instead of a half-saved one.
--
-- SECURITY INVOKER: runs as the photographer, so RLS and every 109 rule
-- still apply. Any rule the save breaks comes back as that rule's message.
--
-- p_invoice:
--   id               uuid | null   null creates a new invoice
--   client_id        uuid          required on create
--   session_id       uuid | null
--   status           'draft' | 'sent'   optional; 'sent' sends it in the same save
--   due_date         date | null
--   payment_platform text | null   on create, omitted = the photographer's default
--   notes            text | null
--   tax_rate         number | null   percent
--   discount_rate    number | null   percent
--   line_items       array | omitted   omitted = leave as they are
--     [{ id?, catalog_item_id?, title, description?, quantity, unit_price,
--        unit_label?, taxable }]   order = display order
--   schedule         array | omitted   omitted = leave as is; [] = no schedule
--     [{ id?, amount, due_date? }]   order = installment order
--
-- Keys that are absent leave that field unchanged on update.
--
-- Rules specific to this function:
--   * Once a payment is logged the line items are locked (109). Sending the
--     same items back is fine (the editor always sends them); sending
--     different ones raises the lock message rather than ignoring them.
--   * Installments keep their order. Existing ones can be removed (if
--     nothing is paid toward them) or edited; new ones go after all
--     existing ones.
--
-- duplicate_invoice(p_invoice_id) copies an invoice into a new draft: same
-- client, session, items, rates, platform and notes; the schedule's amounts
-- without due dates. Used for "void and reissue".

begin;

create or replace function public.save_invoice(p_invoice jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_invoice->>'id', '')::uuid;
  v_uid uuid := auth.uid();
  v_has_payments boolean := false;
  v_existing jsonb;
  v_given jsonb;
  v_item jsonb;
  v_row jsonb;
  v_ord integer;
  v_keep uuid[];
  v_existing_ids uuid[];
  v_new_seen boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  -- ── Invoice row ──────────────────────────────────────────────────────
  if v_id is null then
    insert into invoices (
      photographer_id, client_id, session_id, status, due_date,
      payment_platform, notes, tax_rate, discount_rate, invoice_number)
    values (
      v_uid,
      nullif(p_invoice->>'client_id', '')::uuid,
      nullif(p_invoice->>'session_id', '')::uuid,
      coalesce(nullif(p_invoice->>'status', ''), 'draft'),
      nullif(p_invoice->>'due_date', '')::date,
      case when p_invoice ? 'payment_platform'
           then nullif(p_invoice->>'payment_platform', '')
           else (select default_invoice_platform from photographers where id = v_uid) end,
      nullif(btrim(coalesce(p_invoice->>'notes', '')), ''),
      nullif(p_invoice->>'tax_rate', '')::numeric,
      nullif(p_invoice->>'discount_rate', '')::numeric,
      0)  -- replaced by the numbering trigger
    returning id into v_id;
  else
    perform 1 from invoices where id = v_id;
    if not found then
      raise exception 'Invoice not found.' using errcode = 'no_data_found';
    end if;

    -- Line items are compared before the invoice row changes, so a save
    -- that would break the lock fails with the lock message.
    select exists (select 1 from invoice_payments where invoice_id = v_id) into v_has_payments;

    update invoices set
      client_id        = case when p_invoice ? 'client_id'        then nullif(p_invoice->>'client_id', '')::uuid        else client_id end,
      session_id       = case when p_invoice ? 'session_id'       then nullif(p_invoice->>'session_id', '')::uuid       else session_id end,
      due_date         = case when p_invoice ? 'due_date'         then nullif(p_invoice->>'due_date', '')::date         else due_date end,
      payment_platform = case when p_invoice ? 'payment_platform' then nullif(p_invoice->>'payment_platform', '')       else payment_platform end,
      notes            = case when p_invoice ? 'notes'            then nullif(btrim(coalesce(p_invoice->>'notes', '')), '') else notes end,
      tax_rate         = case when p_invoice ? 'tax_rate'         then nullif(p_invoice->>'tax_rate', '')::numeric      else tax_rate end,
      discount_rate    = case when p_invoice ? 'discount_rate'    then nullif(p_invoice->>'discount_rate', '')::numeric else discount_rate end,
      status           = case when nullif(p_invoice->>'status', '') is not null then p_invoice->>'status' else status end
    where id = v_id;
  end if;

  -- ── Line items ───────────────────────────────────────────────────────
  if jsonb_typeof(p_invoice->'line_items') = 'array' then
    -- Normalised copy of what was sent, in order.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',              nullif(li->>'id', ''),
             'catalog_item_id', nullif(li->>'catalog_item_id', ''),
             'title',           btrim(coalesce(li->>'title', '')),
             'description',     nullif(btrim(coalesce(li->>'description', '')), ''),
             'quantity',        coalesce(nullif(li->>'quantity', '')::numeric, 1)::numeric(10,2),
             'unit_price',      coalesce(nullif(li->>'unit_price', '')::numeric, 0)::numeric(12,2),
             'unit_label',      nullif(btrim(coalesce(li->>'unit_label', '')), ''),
             'taxable',         coalesce((li->>'taxable')::boolean, true)
           ) order by ord), '[]'::jsonb)
      into v_given
      from jsonb_array_elements(p_invoice->'line_items') with ordinality as t(li, ord);

    if v_has_payments then
      select coalesce(jsonb_agg(jsonb_build_object(
               'catalog_item_id', catalog_item_id::text, 'title', title, 'description', description,
               'quantity', quantity, 'unit_price', unit_price, 'unit_label', unit_label, 'taxable', taxable
             ) order by sort_order, created_at), '[]'::jsonb)
        into v_existing
        from invoice_line_items where invoice_id = v_id;

      if v_existing is distinct from (
           select coalesce(jsonb_agg(g - 'id' order by ord), '[]'::jsonb)
             from jsonb_array_elements(v_given) with ordinality as t(g, ord)) then
        raise exception 'Line items are locked because a payment has been logged. Void and reissue to make changes.'
          using errcode = 'check_violation';
      end if;
    else
      -- Remove lines that weren't sent back.
      select coalesce(array_agg((g->>'id')::uuid), '{}')
        into v_keep
        from jsonb_array_elements(v_given) g where g->>'id' is not null;
      delete from invoice_line_items where invoice_id = v_id and not (id = any(v_keep));

      v_ord := 0;
      for v_item in select g from jsonb_array_elements(v_given) g loop
        v_ord := v_ord + 1;
        if v_item->>'id' is not null then
          update invoice_line_items set
            catalog_item_id = (v_item->>'catalog_item_id')::uuid,
            title = v_item->>'title',
            description = v_item->>'description',
            quantity = (v_item->>'quantity')::numeric,
            unit_price = (v_item->>'unit_price')::numeric,
            unit_label = v_item->>'unit_label',
            taxable = (v_item->>'taxable')::boolean,
            sort_order = v_ord
          where id = (v_item->>'id')::uuid and invoice_id = v_id;
          if not found then
            raise exception 'A line item on this invoice no longer exists. Reload and try again.' using errcode = 'no_data_found';
          end if;
        else
          insert into invoice_line_items
            (invoice_id, catalog_item_id, title, description, quantity, unit_price, unit_label, taxable, sort_order)
          values
            (v_id, (v_item->>'catalog_item_id')::uuid, v_item->>'title', v_item->>'description',
             (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
             v_item->>'unit_label', (v_item->>'taxable')::boolean, v_ord);
        end if;
      end loop;
    end if;
  end if;

  -- ── Schedule ─────────────────────────────────────────────────────────
  if jsonb_typeof(p_invoice->'schedule') = 'array' then
    select coalesce(array_agg(id order by sequence), '{}') into v_existing_ids
      from invoice_payment_schedule where invoice_id = v_id;

    -- Existing installments keep their relative order; new ones go last.
    v_new_seen := false;
    for v_row in select r from jsonb_array_elements(p_invoice->'schedule') r loop
      if nullif(v_row->>'id', '') is null then
        v_new_seen := true;
      elsif v_new_seen then
        raise exception 'New installments go after the existing ones.' using errcode = 'check_violation';
      end if;
    end loop;

    select coalesce(array_agg((r->>'id')::uuid order by ord), '{}')
      into v_keep
      from jsonb_array_elements(p_invoice->'schedule') with ordinality as t(r, ord)
     where nullif(r->>'id', '') is not null;

    if v_keep <> (select coalesce(array_agg(e order by o), '{}')
                    from unnest(v_existing_ids) with ordinality as u(e, o)
                   where e = any(v_keep)) then
      raise exception 'Installments can''t be reordered.' using errcode = 'check_violation';
    end if;

    -- Removed rows first (the 109 guard refuses any with payments), then
    -- renumber and update the kept ones in ascending order (only ever moving
    -- down into freed slots), then add the new ones at the end.
    delete from invoice_payment_schedule where invoice_id = v_id and not (id = any(v_keep));

    v_ord := 0;
    for v_row in select r from jsonb_array_elements(p_invoice->'schedule') r loop
      v_ord := v_ord + 1;
      if nullif(v_row->>'id', '') is not null then
        update invoice_payment_schedule set
          sequence = v_ord,
          amount   = (v_row->>'amount')::numeric(12,2),
          due_date = nullif(v_row->>'due_date', '')::date
        where id = (v_row->>'id')::uuid and invoice_id = v_id
          and (sequence, amount, due_date) is distinct from
              (v_ord, (v_row->>'amount')::numeric(12,2), nullif(v_row->>'due_date', '')::date);
      else
        insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date)
        values (v_id, v_ord, (v_row->>'amount')::numeric(12,2), nullif(v_row->>'due_date', '')::date);
      end if;
    end loop;
  end if;

  return v_id;
end $$;

create or replace function public.duplicate_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src invoices%rowtype;
  v_new uuid;
begin
  select * into v_src from invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'no_data_found';
  end if;
  if v_src.client_id is null then
    raise exception 'This invoice''s client was deleted, so it can''t be duplicated.' using errcode = 'check_violation';
  end if;

  insert into invoices (photographer_id, client_id, session_id, status, payment_platform,
                        notes, tax_rate, discount_rate, invoice_number)
  values (v_src.photographer_id, v_src.client_id, v_src.session_id, 'draft', v_src.payment_platform,
          v_src.notes, v_src.tax_rate, v_src.discount_rate, 0)
  returning id into v_new;

  insert into invoice_line_items
    (invoice_id, catalog_item_id, title, description, quantity, unit_price, unit_label, taxable, sort_order)
  select v_new, catalog_item_id, title, description, quantity, unit_price, unit_label, taxable, sort_order
    from invoice_line_items where invoice_id = p_invoice_id;

  insert into invoice_payment_schedule (invoice_id, sequence, amount)
  select v_new, sequence, amount
    from invoice_payment_schedule where invoice_id = p_invoice_id;

  return v_new;
end $$;

revoke all on function public.save_invoice(jsonb), public.duplicate_invoice(uuid) from public, anon;
grant execute on function public.save_invoice(jsonb), public.duplicate_invoice(uuid) to authenticated, service_role;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.duplicate_invoice(uuid), public.save_invoice(jsonb);
-- commit;
