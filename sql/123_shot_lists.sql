-- 123_shot_lists.sql
-- v1.7.0 step 1b: Shot Lists (one per session) and what clients add to them.
--
--   1. session_shot_lists  -- one per session; share_token for /poses/:token;
--      settings copied from PoseVault's shared_galleries (favorites, comments,
--      uploads, upload approval, per-viewer cap, lock). photographer_id is
--      always filled from the session, so it can't point at someone else's.
--   2. shot_list_sections  -- optional sections ("Look 1", "Ceremony").
--   3. shot_list_items     -- a library pose (references pose_library_images,
--      no copy) or a client upload (own R2 key under
--      photographers/{id}/poses/lists/{list id}/). Client uploads start
--      'pending' when approval is on. A library image used on a list can't
--      be deleted, only archived (FK restrict).
--   4. shot_list_viewers / shot_list_favorites / shot_list_comments -- same
--      shapes as gallery_viewers / gallery_favorites / gallery_comments.
--      Visitors never touch these tables directly; they go through the
--      SECURITY DEFINER functions in 124.
--
-- Run after: 122_pose_library.sql

begin;

-- ── 1. Shot lists ────────────────────────────────────────────────────────
create table public.session_shot_lists (
  id                      uuid primary key default gen_random_uuid(),
  session_id              uuid not null unique references public.sessions(id) on delete cascade,
  photographer_id         uuid not null references public.photographers(id) on delete cascade,
  share_token             text not null unique default replace(gen_random_uuid()::text, '-', ''),
  intro_note              text,
  is_active               boolean not null default true,
  allow_favorites         boolean not null default true,
  allow_comments          boolean not null default true,
  allow_uploads           boolean not null default true,
  require_upload_approval boolean not null default true,
  max_uploads_per_viewer  integer not null default 10 check (max_uploads_per_viewer between 0 and 100),
  is_locked               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- photographer_id always comes from the session, whatever the caller sent.
create or replace function public.shot_list_set_photographer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select photographer_id into new.photographer_id from sessions where id = new.session_id;
  if new.photographer_id is null then
    raise exception 'Session not found';
  end if;
  return new;
end $$;

create trigger shot_list_set_photographer before insert or update of session_id on public.session_shot_lists
  for each row execute function public.shot_list_set_photographer();
create trigger set_updated_at before update on public.session_shot_lists
  for each row execute function public.set_updated_at();

-- ── 2. Sections ──────────────────────────────────────────────────────────
create table public.shot_list_sections (
  id           uuid primary key default gen_random_uuid(),
  shot_list_id uuid not null references public.session_shot_lists(id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, shot_list_id)
);
create index shot_list_sections_list_idx on public.shot_list_sections (shot_list_id, sort_order);

-- ── 4a. Viewers (needed by items) ────────────────────────────────────────
create table public.shot_list_viewers (
  id           uuid primary key default gen_random_uuid(),
  shot_list_id uuid not null references public.session_shot_lists(id) on delete cascade,
  session_id   text not null unique,
  display_name text,
  email        text,
  created_at   timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique (id, shot_list_id)
);
create index shot_list_viewers_list_idx on public.shot_list_viewers (shot_list_id);

-- ── 3. Items ─────────────────────────────────────────────────────────────
create table public.shot_list_items (
  id                    uuid primary key default gen_random_uuid(),
  shot_list_id          uuid not null references public.session_shot_lists(id) on delete cascade,
  section_id            uuid,
  source                text not null check (source in ('library', 'client')),
  library_image_id      uuid references public.pose_library_images(id) on delete restrict,
  r2_key                text unique,
  file_size             bigint check (file_size >= 0),
  width                 integer,
  height                integer,
  uploaded_by_viewer_id uuid,
  status                text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  note                  text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  -- the section and the uploading viewer must belong to the same list
  foreign key (section_id, shot_list_id) references public.shot_list_sections (id, shot_list_id) on delete set null (section_id),
  foreign key (uploaded_by_viewer_id, shot_list_id) references public.shot_list_viewers (id, shot_list_id) on delete set null (uploaded_by_viewer_id),
  check (
    (source = 'library' and library_image_id is not null and r2_key is null)
    or (source = 'client' and library_image_id is null and r2_key is not null)
  )
);
create index shot_list_items_list_idx on public.shot_list_items (shot_list_id, section_id, sort_order);
create unique index shot_list_items_library_once on public.shot_list_items (shot_list_id, library_image_id)
  where library_image_id is not null;

-- Library items must come from the list owner's library; client upload keys
-- must sit in the list's own folder.
create or replace function public.shot_list_item_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select photographer_id into v_owner from session_shot_lists where id = new.shot_list_id;
  if new.source = 'library' and not exists (
    select 1 from pose_library_images where id = new.library_image_id and photographer_id = v_owner
  ) then
    raise exception 'Pose not in this photographer''s library';
  end if;
  if new.source = 'client'
     and new.r2_key not like 'photographers/' || v_owner::text || '/poses/lists/' || new.shot_list_id::text || '/%' then
    raise exception 'Upload key outside this shot list';
  end if;
  return new;
end $$;

create trigger shot_list_item_check before insert or update of shot_list_id, source, library_image_id, r2_key
  on public.shot_list_items for each row execute function public.shot_list_item_check();

-- ── 4b. Favorites and comments ───────────────────────────────────────────
create table public.shot_list_favorites (
  id           uuid primary key default gen_random_uuid(),
  shot_list_id uuid not null references public.session_shot_lists(id) on delete cascade,
  item_id      uuid not null references public.shot_list_items(id) on delete cascade,
  viewer_id    uuid not null references public.shot_list_viewers(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (item_id, viewer_id)
);
create index shot_list_favorites_list_idx on public.shot_list_favorites (shot_list_id);

create table public.shot_list_comments (
  id              uuid primary key default gen_random_uuid(),
  shot_list_id    uuid not null references public.session_shot_lists(id) on delete cascade,
  item_id         uuid references public.shot_list_items(id) on delete cascade,
  viewer_id       uuid references public.shot_list_viewers(id) on delete cascade,
  photographer_id uuid references public.photographers(id) on delete cascade,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check ((viewer_id is null) <> (photographer_id is null))
);
create index shot_list_comments_list_idx on public.shot_list_comments (shot_list_id, created_at);

-- ── Grants and RLS (authenticated + service_role; visitors use 124's RPCs) ─
revoke all on public.session_shot_lists, public.shot_list_sections, public.shot_list_items,
  public.shot_list_viewers, public.shot_list_favorites, public.shot_list_comments from public, anon;
grant select, insert, update, delete on public.session_shot_lists, public.shot_list_sections, public.shot_list_items
  to authenticated, service_role;
grant select, delete on public.shot_list_viewers, public.shot_list_favorites to authenticated;
grant select, insert, update, delete on public.shot_list_viewers, public.shot_list_favorites to service_role;
grant select, insert, update on public.shot_list_comments to authenticated;
grant select, insert, update, delete on public.shot_list_comments to service_role;

alter table public.session_shot_lists  enable row level security;
alter table public.shot_list_sections  enable row level security;
alter table public.shot_list_items     enable row level security;
alter table public.shot_list_viewers   enable row level security;
alter table public.shot_list_favorites enable row level security;
alter table public.shot_list_comments  enable row level security;

-- The session must be the caller's; photographer_id is then set by the trigger.
create policy "Photographers manage own shot lists" on public.session_shot_lists
  for all to authenticated
  using (photographer_id = auth.uid())
  with check (session_id in (select id from sessions where photographer_id = auth.uid()));

create policy "Photographers manage own shot list sections" on public.shot_list_sections
  for all to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()))
  with check (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

create policy "Photographers manage own shot list items" on public.shot_list_items
  for all to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()))
  with check (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

create policy "Photographers read and remove viewers on own lists" on public.shot_list_viewers
  for all to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

create policy "Photographers read and remove favorites on own lists" on public.shot_list_favorites
  for all to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

create policy "Photographers read comments on own lists" on public.shot_list_comments
  for select to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

-- Photographers reply as themselves (never as a viewer), and can hide
-- (deleted_at) comments on their own lists.
create policy "Photographers reply on own lists" on public.shot_list_comments
  for insert to authenticated
  with check (photographer_id = auth.uid() and viewer_id is null
              and shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

create policy "Photographers moderate comments on own lists" on public.shot_list_comments
  for update to authenticated
  using (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()))
  with check (shot_list_id in (select id from session_shot_lists where photographer_id = auth.uid()));

revoke all on function public.shot_list_set_photographer() from public, anon, authenticated;
revoke all on function public.shot_list_item_check() from public, anon, authenticated;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop table if exists public.shot_list_comments;
-- drop table if exists public.shot_list_favorites;
-- drop table if exists public.shot_list_items;
-- drop table if exists public.shot_list_viewers;
-- drop table if exists public.shot_list_sections;
-- drop table if exists public.session_shot_lists;
-- drop function if exists public.shot_list_item_check();
-- drop function if exists public.shot_list_set_photographer();
-- commit;
