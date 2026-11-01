-- 118_invoice_emails.sql
-- v1.6.0 step 9: invoice emails.
--
--   1. invoice_email_templates -- Account -> Templates -> Invoice Emails /
--      Payment Reminders. Same shape as review_request_templates (086) plus
--      kind; one default per photographer per kind (partial unique index,
--      switched with set_default_invoice_email_template).
--   2. invoice_email_log       -- every invoice email the send-invoice Edge
--      Function sends (who it went to, when, invoice or reminder). Read by
--      the photographer; written only by the Edge Function (service role).
--
-- Sending happens in the send-invoice Edge Function (it attaches the PDF).
--
-- Run after: 117_invoice_logo.sql

begin;

-- ── 1. Templates ─────────────────────────────────────────────────────────
create table public.invoice_email_templates (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  kind            text not null check (kind in ('invoice', 'reminder')),
  name            text not null check (length(btrim(name)) > 0),
  subject         text not null check (length(btrim(subject)) > 0),
  body            text not null default '',
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index invoice_email_templates_photographer_idx on public.invoice_email_templates (photographer_id, kind);
create unique index invoice_email_templates_one_default
  on public.invoice_email_templates (photographer_id, kind) where is_default;

create trigger set_updated_at before update on public.invoice_email_templates
  for each row execute function public.set_updated_at();

-- ── 2. Send log ──────────────────────────────────────────────────────────
create table public.invoice_email_log (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  kind            text not null check (kind in ('invoice', 'reminder')),
  sent_to         text not null,
  subject         text not null,
  pdf_attached    boolean not null default true,
  resend_id       text,
  sent_at         timestamptz not null default now()
);

create index invoice_email_log_invoice_idx on public.invoice_email_log (invoice_id, sent_at desc);

-- ── Grants and RLS (authenticated + service_role only) ──────────────────
revoke all on public.invoice_email_templates, public.invoice_email_log from public, anon;
grant select, insert, update, delete on public.invoice_email_templates to authenticated, service_role;
grant select on public.invoice_email_log to authenticated;
grant select, insert, update, delete on public.invoice_email_log to service_role;

alter table public.invoice_email_templates enable row level security;
alter table public.invoice_email_log       enable row level security;

create policy "Photographers manage own invoice email templates" on public.invoice_email_templates
  for all to authenticated
  using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());

create policy "Photographers read own invoice email log" on public.invoice_email_log
  for select to authenticated
  using (photographer_id = auth.uid());

-- ── set_default_invoice_email_template ───────────────────────────────────
-- Same two-step as set_default_review_request_template: clear, then set,
-- so the partial unique index never sees two defaults. p_template_id NULL
-- clears the default for p_kind.
create or replace function public.set_default_invoice_email_template(p_kind text, p_template_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('invoice', 'reminder') then
    raise exception 'Unknown template kind' using errcode = 'check_violation';
  end if;
  if p_template_id is not null and not exists (
    select 1 from invoice_email_templates
     where id = p_template_id and photographer_id = auth.uid() and kind = p_kind
  ) then
    raise exception 'Template not found';
  end if;

  update invoice_email_templates
     set is_default = false
   where photographer_id = auth.uid() and kind = p_kind and is_default
     and id is distinct from p_template_id;

  if p_template_id is not null then
    update invoice_email_templates set is_default = true where id = p_template_id;
  end if;
end $$;

revoke all on function public.set_default_invoice_email_template(text, uuid) from public, anon;
grant execute on function public.set_default_invoice_email_template(text, uuid) to authenticated, service_role;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.set_default_invoice_email_template(text, uuid);
-- drop table if exists public.invoice_email_log;
-- drop table if exists public.invoice_email_templates;
-- commit;
