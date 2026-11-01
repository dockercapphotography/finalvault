-- Local stand-in for the parts of the live Supabase schema migrations 107–110 touch.
-- Columns, policies and FKs copied from the Oct 31 schema checks.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create or replace function public.set_updated_at()
 returns trigger language plpgsql set search_path to 'public'
as $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

create table photographers (
  id uuid primary key,
  display_name text,
  business_name text,
  payment_links jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table photographers enable row level security;
create policy "Photographers can read own profile" on photographers for select using (auth.uid() = id);
create policy "Photographers can update own profile" on photographers for update using (auth.uid() = id);
create policy "Photographers can insert own profile" on photographers for insert with check (auth.uid() = id);
grant all on photographers to anon, authenticated, service_role;

create table clients (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid references photographers(id) on delete cascade,
  first_name text, last_name text, email text,
  portal_token text unique,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table clients enable row level security;
create policy "Photographers manage own clients" on clients using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
grant all on clients to anon, authenticated, service_role;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid references photographers(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text, mode text, session_date date,
  session_fee numeric, retainer_amount numeric, retainer_paid boolean default false,
  balance_due numeric, balance_due_date date, payment_status text default 'unpaid',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table sessions enable row level security;
create policy "photographers manage own sessions" on sessions using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
grant all on sessions to anon, authenticated, service_role;

-- Emulate Supabase's post-Oct-30 behaviour: no automatic grants on new tables.
alter default privileges in schema public revoke all on tables from public;

-- Booking shoot types (needed by 120).
create table signup_shoot_types (
  id uuid primary key default gen_random_uuid(),
  signup_page_id uuid, name text not null, duration_minutes integer, session_type text,
  description text, sort_order integer default 0, created_at timestamptz default now(),
  price numeric, retainer_amount numeric
);

-- Contract templates (needed by 119).
create table contract_templates (
  id uuid primary key default gen_random_uuid(), photographer_id uuid, name text, body text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Row types used by the booking functions recreated in 120 (shape only).
create table signup_pages (id uuid primary key default gen_random_uuid(), photographer_id uuid, title text, timezone text,
  venue_address text, venue_lat numeric, venue_lng numeric);
create table signup_slots (id uuid primary key default gen_random_uuid(), signup_page_id uuid, shoot_type_id uuid,
  start_time timestamptz, end_time timestamptz, claimed_at timestamptz, session_id uuid);
create table signup_inquiry_windows (id uuid primary key default gen_random_uuid(), signup_page_id uuid);
