-- 107_invoices_schema.sql
-- v1.6.0 Invoicing, part 1 of 4: tables, keys, indexes, grants, RLS.
--
-- Rules (108 totals, 109 triggers) and the catalog seed (110) follow.
-- Grants are explicit because new public tables no longer get automatic
-- Data API grants (Supabase change, Oct 30 2026). No anon access anywhere:
-- the Client Portal reads invoices through token-checked RPCs (later step).

begin;

-- ── photographers: default payment platform for new invoices ──────────────
alter table public.photographers
  add column if not exists default_invoice_platform text
    check (default_invoice_platform in ('venmo', 'paypal', 'cashapp', 'kofi', 'zelle'));

-- ── Composite keys so an invoice can only point at its own photographer's ─
--    client or session (RLS only checks the invoice row itself).
alter table public.clients
  add constraint clients_id_photographer_id_key unique (id, photographer_id);
alter table public.sessions
  add constraint sessions_id_photographer_id_key unique (id, photographer_id);

-- ── Invoice-number counter (one row per photographer) ────────────────────
-- Only the numbering trigger (SECURITY DEFINER, 109) touches this table.
create table public.invoice_number_counters (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  next_number     integer not null default 1001 check (next_number >= 1)
);
alter table public.invoice_number_counters enable row level security;
-- RLS on with no policies: invisible to authenticated even if a grant slipped in.
revoke all on public.invoice_number_counters from public, anon, authenticated;
grant select, insert, update, delete on public.invoice_number_counters to service_role;

-- ── Catalog ──────────────────────────────────────────────────────────────
create table public.invoice_catalog_items (
  id                 uuid primary key default gen_random_uuid(),
  photographer_id    uuid not null references public.photographers(id) on delete cascade,
  name               text not null check (length(btrim(name)) > 0),
  description        text,
  default_unit_price numeric(12,2) not null default 0 check (default_unit_price >= 0),
  unit_label         text,
  taxable_default    boolean not null default true,
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index invoice_catalog_items_photographer_idx
  on public.invoice_catalog_items (photographer_id, active, sort_order);

-- ── Invoices ─────────────────────────────────────────────────────────────
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  photographer_id  uuid not null references public.photographers(id) on delete cascade,
  -- Required when created (enforced by trigger, 109); becomes null only if
  -- the client is later deleted. client_name/client_email keep who it was.
  client_id        uuid,
  client_name      text,
  client_email     text,
  session_id       uuid,
  invoice_number   integer not null,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'void')),
  due_date         date,
  payment_platform text check (payment_platform in ('venmo', 'paypal', 'cashapp', 'kofi', 'zelle')),
  notes            text,
  tax_rate         numeric(6,3) check (tax_rate between 0 and 100),
  discount_rate    numeric(6,3) check (discount_rate between 0 and 100),
  sent_at          timestamptz,
  voided_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint invoices_number_key unique (photographer_id, invoice_number),
  -- Deleting the client keeps the invoice (client_id set null, snapshot kept).
  constraint invoices_client_fkey foreign key (client_id, photographer_id)
    references public.clients (id, photographer_id) on delete set null (client_id),
  -- Deleting the session turns its invoices into standalone invoices.
  constraint invoices_session_fkey foreign key (session_id, photographer_id)
    references public.sessions (id, photographer_id) on delete set null (session_id)
);
create index invoices_photographer_status_idx on public.invoices (photographer_id, status);
create index invoices_session_idx on public.invoices (session_id) where session_id is not null;
create index invoices_client_idx  on public.invoices (client_id)  where client_id is not null;

-- ── Line items ───────────────────────────────────────────────────────────
create table public.invoice_line_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  -- Line items keep their own copy of title/price/unit, so the link is only
  -- a reference. A used catalog item can't be deleted from the app (109
  -- trigger; the UI archives it instead); SET NULL here only matters when a
  -- whole account is deleted and both sides go in one cascade.
  catalog_item_id uuid references public.invoice_catalog_items(id) on delete set null,
  title           text not null check (length(btrim(title)) > 0),
  description     text,
  quantity        numeric(10,2) not null default 1 check (quantity > 0),
  unit_price      numeric(12,2) not null check (unit_price >= 0),
  unit_label      text,
  taxable         boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id, sort_order);
create index invoice_line_items_catalog_idx on public.invoice_line_items (catalog_item_id) where catalog_item_id is not null;

-- ── Payment schedule ─────────────────────────────────────────────────────
create table public.invoice_payment_schedule (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  sequence   integer not null check (sequence >= 1),
  amount     numeric(12,2) not null check (amount > 0),
  due_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_payment_schedule_sequence_key unique (invoice_id, sequence)
);

-- ── Payments ─────────────────────────────────────────────────────────────
create table public.invoice_payments (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  paid_date  date not null default current_date,
  method     text check (method in ('cash', 'check', 'card', 'venmo', 'paypal', 'cashapp', 'zelle', 'kofi', 'other')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoice_payments_invoice_idx on public.invoice_payments (invoice_id);

-- ── updated_at triggers ──────────────────────────────────────────────────
create trigger set_updated_at before update on public.invoice_catalog_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoice_line_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoice_payment_schedule
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.invoice_payments
  for each row execute function public.set_updated_at();

-- ── Grants: authenticated + service_role only ────────────────────────────
revoke all on public.invoice_catalog_items, public.invoices, public.invoice_line_items,
              public.invoice_payment_schedule, public.invoice_payments
  from public, anon;
grant select, insert, update, delete on public.invoice_catalog_items, public.invoices,
      public.invoice_line_items, public.invoice_payment_schedule, public.invoice_payments
  to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.invoice_catalog_items    enable row level security;
alter table public.invoices                 enable row level security;
alter table public.invoice_line_items       enable row level security;
alter table public.invoice_payment_schedule enable row level security;
alter table public.invoice_payments         enable row level security;

create policy "Photographers manage own invoice catalog" on public.invoice_catalog_items
  for all to authenticated
  using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());

create policy "Photographers manage own invoices" on public.invoices
  for all to authenticated
  using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());

create policy "Photographers manage own invoice line items" on public.invoice_line_items
  for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()));

create policy "Photographers manage own invoice schedules" on public.invoice_payment_schedule
  for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()));

create policy "Photographers manage own invoice payments" on public.invoice_payments
  for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.photographer_id = auth.uid()));

commit;

-- ── Rollback (run 110, 109, 108 rollbacks first) ─────────────────────────
-- begin;
-- drop table if exists public.invoice_payments, public.invoice_payment_schedule,
--   public.invoice_line_items, public.invoices, public.invoice_catalog_items,
--   public.invoice_number_counters;
-- alter table public.sessions drop constraint if exists sessions_id_photographer_id_key;
-- alter table public.clients  drop constraint if exists clients_id_photographer_id_key;
-- alter table public.photographers drop column if exists default_invoice_platform;
-- commit;
