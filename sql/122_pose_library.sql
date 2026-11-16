-- 122_pose_library.sql
-- v1.7.0 step 1a: Pose Library, tag vocabulary, feature flags, AI usage log.
--
--   1. photographer_features   -- per-account switches that only an admin can
--      turn on (photographers can read their own). The photographers table
--      can't hold these: its update policy has no column restriction, so a
--      photographer could flip any flag stored there. First feature:
--      'ai_tag_suggestions' (Gemma 4 tag suggestions, off for everyone).
--   2. pose_tag_groups / pose_tag_vocabulary -- each photographer's own,
--      fully editable tag list. Groups carry single_choice (framing, angle).
--      seed_pose_tag_vocabulary() fills an empty list from pose_tag_seed(),
--      the 119-tag list tested Nov 14-15 (Nick's refined list replaces the
--      seed later). rename_pose_tag / delete_pose_tag keep images in step.
--   3. pose_library_images -- the photographer's pose references (1200px
--      WebP in R2 under photographers/{id}/poses/library/). Tags are a text
--      array; AI suggestions sit beside them until accepted.
--   4. ai_usage_log -- one row per AI call (tokens, neurons) for the daily
--      cap; written by the r2-worker (service role), readable by the owner.
--      ai_request_allowed() checks the flag and the cap in one call.
--   5. increment_photographer_storage -- atomic bytes_used change for the new
--      upload routes (the existing worker code reads then writes).
--
-- Run after: 121_fix_booking_invoice_permissions.sql

begin;

-- ── 1. Feature flags ─────────────────────────────────────────────────────
create table public.photographer_features (
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  feature         text not null check (feature in ('ai_tag_suggestions')),
  enabled         boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (photographer_id, feature)
);

create trigger set_updated_at before update on public.photographer_features
  for each row execute function public.set_updated_at();

revoke all on public.photographer_features from public, anon;
grant select, insert, update, delete on public.photographer_features to authenticated, service_role;
alter table public.photographer_features enable row level security;

create policy "Photographers read own features" on public.photographer_features
  for select to authenticated using (photographer_id = auth.uid() or is_admin());
create policy "Admins manage features" on public.photographer_features
  for all to authenticated using (is_admin()) with check (is_admin());

-- Admin toggle (used by the admin page). Upsert so a missing row means "off".
create or replace function public.set_photographer_feature(p_photographer_id uuid, p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  insert into photographer_features (photographer_id, feature, enabled)
  values (p_photographer_id, p_feature, p_enabled)
  on conflict (photographer_id, feature) do update set enabled = excluded.enabled;
end $$;

-- True when the feature is on for that photographer (false when no row).
create or replace function public.photographer_has_feature(p_photographer_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from photographer_features
                    where photographer_id = p_photographer_id and feature = p_feature), false)
$$;

revoke all on function public.set_photographer_feature(uuid, text, boolean) from public, anon;
grant execute on function public.set_photographer_feature(uuid, text, boolean) to authenticated, service_role;
revoke all on function public.photographer_has_feature(uuid, text) from public, anon;
grant execute on function public.photographer_has_feature(uuid, text) to authenticated, service_role;

-- ── 2. Tag vocabulary ────────────────────────────────────────────────────
create table public.pose_tag_groups (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  single_choice   boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, photographer_id)
);
create unique index pose_tag_groups_name_uniq on public.pose_tag_groups (photographer_id, lower(btrim(name)));

-- Tags are stored lower-case and trimmed, so "Sitting" and "sitting " match.
create table public.pose_tag_vocabulary (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  group_id        uuid not null,
  tag             text not null check (tag = lower(btrim(tag)) and length(tag) between 1 and 60),
  definition      text,
  manual_only     boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (photographer_id, tag),
  -- the group must belong to the same photographer
  foreign key (group_id, photographer_id) references public.pose_tag_groups (id, photographer_id) on delete cascade
);
create index pose_tag_vocabulary_group_idx on public.pose_tag_vocabulary (group_id, sort_order);

create trigger set_updated_at before update on public.pose_tag_groups
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pose_tag_vocabulary
  for each row execute function public.set_updated_at();

-- ── 3. Library images ────────────────────────────────────────────────────
create table public.pose_library_images (
  id                 uuid primary key default gen_random_uuid(),
  photographer_id    uuid not null references public.photographers(id) on delete cascade,
  r2_key             text not null unique,
  file_size          bigint not null default 0 check (file_size >= 0),
  width              integer,
  height             integer,
  title              text,
  notes              text,
  tags               text[] not null default '{}',
  suggested_tags     text[] not null default '{}',
  suggested_new_tags text[] not null default '{}',
  ai_description     text,
  tagged_at          timestamptz,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, photographer_id),
  -- keys live under the photographer's own library folder
  check (r2_key like 'photographers/' || photographer_id::text || '/poses/library/%')
);
create index pose_library_images_owner_idx on public.pose_library_images (photographer_id, created_at desc);
create index pose_library_images_tags_idx on public.pose_library_images using gin (tags);

create trigger set_updated_at before update on public.pose_library_images
  for each row execute function public.set_updated_at();

-- ── 4. AI usage log ──────────────────────────────────────────────────────
create table public.ai_usage_log (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  feature         text not null,
  image_id        uuid references public.pose_library_images(id) on delete set null,
  model           text not null,
  tokens_in       integer,
  tokens_out      integer,
  neurons         numeric,
  ok              boolean not null default true,
  created_at      timestamptz not null default now()
);
create index ai_usage_log_owner_day_idx on public.ai_usage_log (photographer_id, feature, created_at desc);

-- ── Grants and RLS ───────────────────────────────────────────────────────
revoke all on public.pose_tag_groups, public.pose_tag_vocabulary, public.pose_library_images, public.ai_usage_log
  from public, anon;
grant select, insert, update, delete on public.pose_tag_groups, public.pose_tag_vocabulary, public.pose_library_images
  to authenticated, service_role;
grant select on public.ai_usage_log to authenticated;
grant select, insert, update, delete on public.ai_usage_log to service_role;

alter table public.pose_tag_groups     enable row level security;
alter table public.pose_tag_vocabulary enable row level security;
alter table public.pose_library_images enable row level security;
alter table public.ai_usage_log        enable row level security;

create policy "Photographers manage own tag groups" on public.pose_tag_groups
  for all to authenticated using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
create policy "Photographers manage own tag vocabulary" on public.pose_tag_vocabulary
  for all to authenticated using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
create policy "Photographers manage own pose library" on public.pose_library_images
  for all to authenticated using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
create policy "Photographers read own AI usage" on public.ai_usage_log
  for select to authenticated using (photographer_id = auth.uid());

-- ── Starter vocabulary ───────────────────────────────────────────────────
-- Groups in order; each tag has an optional definition (sent to the model)
-- and manual (never suggested by AI). Replace this function's body to change
-- the starter list for photographers who haven't seeded yet.
create or replace function public.pose_tag_seed()
returns jsonb language sql immutable set search_path = public as $seed$
  select $json$
{"groups": [
 {"name": "people", "single": false, "tags": [
    {"tag": "solo"},
    {"tag": "couple"},
    {"tag": "duo"},
    {"tag": "group"},
    {"tag": "family"},
    {"tag": "child"},
    {"tag": "baby"},
    {"tag": "pet"},
    {"tag": "maternity"},
    {"tag": "man", "manual": true},
    {"tag": "woman", "manual": true}
 ]},
 {"name": "body", "single": false, "tags": [
    {"tag": "standing"},
    {"tag": "sitting"},
    {"tag": "kneeling"},
    {"tag": "crouching"},
    {"tag": "laying down"},
    {"tag": "leaning"},
    {"tag": "walking"},
    {"tag": "running"},
    {"tag": "jumping"},
    {"tag": "dancing"},
    {"tag": "dip"},
    {"tag": "lift"},
    {"tag": "back to camera", "def": "the main subject's back faces the camera"},
    {"tag": "reclining"},
    {"tag": "head tilt"}
 ]},
 {"name": "framing", "single": true, "tags": [
    {"tag": "full body"},
    {"tag": "three-quarter", "def": "framed from about mid-thigh up"},
    {"tag": "half body", "def": "framed from about the waist up"},
    {"tag": "headshot"},
    {"tag": "close-up", "def": "tightly framed on faces, hands or a detail"},
    {"tag": "detail shot"}
 ]},
 {"name": "angle", "single": true, "tags": [
    {"tag": "front", "def": "the subject faces the camera"},
    {"tag": "profile"},
    {"tag": "three-quarter view", "def": "the subject is turned about 45 degrees from the camera"},
    {"tag": "over-the-shoulder"},
    {"tag": "from below"},
    {"tag": "from above"},
    {"tag": "eye level"}
 ]},
 {"name": "hands and gaze", "single": false, "tags": [
    {"tag": "hand in hair"},
    {"tag": "hands on hips", "def": "a hand is resting on that person's own hip"},
    {"tag": "arms crossed"},
    {"tag": "hand to face"},
    {"tag": "hands in pocket", "def": "a hand is visibly inside a pocket"},
    {"tag": "looking at camera"},
    {"tag": "looking away"},
    {"tag": "eyes closed"},
    {"tag": "looking at each other"},
    {"tag": "hand on chest"},
    {"tag": "hand on shoulder"},
    {"tag": "hand on waist"},
    {"tag": "heart hands"},
    {"tag": "arm around shoulder"},
    {"tag": "holding prop"}
 ]},
 {"name": "interaction", "single": false, "tags": [
    {"tag": "hug", "def": "face-to-face embrace"},
    {"tag": "embrace from behind", "def": "one person wraps their arms around the other from behind; both face roughly the same way"},
    {"tag": "forehead touch"},
    {"tag": "kiss"},
    {"tag": "holding hands"},
    {"tag": "carrying", "def": "one person holds the other off the ground"},
    {"tag": "back to back"},
    {"tag": "piggyback"},
    {"tag": "cheek kiss"},
    {"tag": "hand kiss"},
    {"tag": "bridal carry", "def": "carrying with one arm under the back and one under the knees"},
    {"tag": "proposal"}
 ]},
 {"name": "props and setting", "single": false, "tags": [
    {"tag": "weapon prop"},
    {"tag": "sword"},
    {"tag": "staff"},
    {"tag": "gun prop"},
    {"tag": "shield"},
    {"tag": "cape or fabric"},
    {"tag": "wings"},
    {"tag": "chair"},
    {"tag": "bed"},
    {"tag": "stairs"},
    {"tag": "against wall"},
    {"tag": "doorway"},
    {"tag": "floor"},
    {"tag": "curtains"},
    {"tag": "mirror"},
    {"tag": "outdoor"},
    {"tag": "studio"},
    {"tag": "engagement ring"},
    {"tag": "bouquet"},
    {"tag": "indoor"}
 ]},
 {"name": "outfit", "single": false, "tags": [
    {"tag": "lingerie"},
    {"tag": "high heels"},
    {"tag": "dress"},
    {"tag": "armor"},
    {"tag": "costume"}
 ]},
 {"name": "emphasis", "single": false, "tags": [
    {"tag": "face focus"},
    {"tag": "hands focus"},
    {"tag": "legs focus"},
    {"tag": "back focus"},
    {"tag": "buttocks focus", "def": "the composition centres on or emphasises the buttocks"},
    {"tag": "breast focus", "def": "the composition centres on or emphasises the chest/breasts"},
    {"tag": "curves", "def": "the pose is built to accentuate body curves (hips, waist, back arch)"}
 ]},
 {"name": "light and color", "single": false, "tags": [
    {"tag": "black and white"},
    {"tag": "bright"},
    {"tag": "low key"},
    {"tag": "backlit"},
    {"tag": "golden hour"}
 ]},
 {"name": "style", "single": false, "tags": [
    {"tag": "cosplay"},
    {"tag": "fantasy"},
    {"tag": "action"},
    {"tag": "battle stance"},
    {"tag": "power pose"},
    {"tag": "dramatic"},
    {"tag": "soft"},
    {"tag": "playful"},
    {"tag": "candid"},
    {"tag": "elegant"},
    {"tag": "villain"},
    {"tag": "heroic"},
    {"tag": "cute"},
    {"tag": "boudoir"},
    {"tag": "romantic"},
    {"tag": "illustration", "def": "a drawing or digital illustration rather than a photograph"}
 ]}
]}
$json$::jsonb
$seed$;

-- Fill the caller's vocabulary from the seed. Does nothing (returns 0) when
-- the caller already has any group, so it can't duplicate or overwrite edits.
create or replace function public.seed_pose_tag_vocabulary()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group jsonb; v_tag jsonb;
  v_group_id uuid; v_gi integer := 0; v_ti integer; v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('pose_tag_seed:' || v_uid::text));
  if exists (select 1 from pose_tag_groups where photographer_id = v_uid) then
    return 0;
  end if;
  for v_group in select * from jsonb_array_elements(pose_tag_seed() -> 'groups') loop
    v_gi := v_gi + 1;
    insert into pose_tag_groups (photographer_id, name, single_choice, sort_order)
    values (v_uid, v_group ->> 'name', coalesce((v_group ->> 'single')::boolean, false), v_gi)
    returning id into v_group_id;
    v_ti := 0;
    for v_tag in select * from jsonb_array_elements(v_group -> 'tags') loop
      v_ti := v_ti + 1;
      insert into pose_tag_vocabulary (photographer_id, group_id, tag, definition, manual_only, sort_order)
      values (v_uid, v_group_id, lower(btrim(v_tag ->> 'tag')), nullif(v_tag ->> 'def', ''),
              coalesce((v_tag ->> 'manual')::boolean, false), v_ti)
      on conflict (photographer_id, tag) do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;

-- Rename a tag everywhere: the vocabulary row and every library image that
-- uses it (applied tags and pending suggestions). Renaming onto an existing
-- tag merges the two.
create or replace function public.rename_pose_tag(p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old text := lower(btrim(p_old));
  v_new text := lower(btrim(p_new));
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if v_new = '' or length(v_new) > 60 then
    raise exception 'Tag must be 1-60 characters' using errcode = 'check_violation';
  end if;
  if v_old = v_new then return; end if;
  if exists (select 1 from pose_tag_vocabulary where photographer_id = v_uid and tag = v_new) then
    delete from pose_tag_vocabulary where photographer_id = v_uid and tag = v_old;
  else
    update pose_tag_vocabulary set tag = v_new where photographer_id = v_uid and tag = v_old;
  end if;
  update pose_library_images
     set tags = (select coalesce(array_agg(distinct t order by t), '{}')
                   from unnest(array_replace(tags, v_old, v_new)) t),
         suggested_tags = (select coalesce(array_agg(distinct t order by t), '{}')
                             from unnest(array_replace(suggested_tags, v_old, v_new)) t)
   where photographer_id = v_uid and (v_old = any(tags) or v_old = any(suggested_tags));
end $$;

-- Remove a tag from the vocabulary and from every library image.
create or replace function public.delete_pose_tag(p_tag text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tag text := lower(btrim(p_tag));
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  delete from pose_tag_vocabulary where photographer_id = v_uid and tag = v_tag;
  update pose_library_images
     set tags = array_remove(tags, v_tag), suggested_tags = array_remove(suggested_tags, v_tag)
   where photographer_id = v_uid and (v_tag = any(tags) or v_tag = any(suggested_tags));
end $$;

revoke all on function public.pose_tag_seed() from public, anon;
grant execute on function public.pose_tag_seed() to authenticated, service_role;
revoke all on function public.seed_pose_tag_vocabulary() from public, anon;
grant execute on function public.seed_pose_tag_vocabulary() to authenticated;
revoke all on function public.rename_pose_tag(text, text) from public, anon;
grant execute on function public.rename_pose_tag(text, text) to authenticated;
revoke all on function public.delete_pose_tag(text) from public, anon;
grant execute on function public.delete_pose_tag(text) to authenticated;

-- ── AI request gate (r2-worker, service role) ────────────────────────────
-- True when the feature is on and the photographer has made fewer than
-- p_daily_cap calls in the last 24 hours. The worker calls this before every
-- model call and logs the call to ai_usage_log afterwards.
create or replace function public.ai_request_allowed(p_photographer_id uuid, p_feature text, p_daily_cap integer)
returns boolean language sql stable security definer set search_path = public as $$
  select photographer_has_feature(p_photographer_id, p_feature)
     and (select count(*) from ai_usage_log
           where photographer_id = p_photographer_id and feature = p_feature
             and created_at > now() - interval '24 hours') < p_daily_cap
$$;

revoke all on function public.ai_request_allowed(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.ai_request_allowed(uuid, text, integer) to service_role;

-- ── 5. Atomic storage counter ────────────────────────────────────────────
-- Adds p_delta (negative to subtract) to bytes_used in one statement, never
-- below zero. Returns the new total, or NULL when the photographer has no
-- photographer_storage row. Service role only (r2-worker).
create or replace function public.increment_photographer_storage(p_photographer_id uuid, p_delta bigint)
returns bigint language sql security definer set search_path = public as $$
  update photographer_storage
     set bytes_used = greatest(0, coalesce(bytes_used, 0) + p_delta), updated_at = now()
   where photographer_id = p_photographer_id
  returning bytes_used
$$;

revoke all on function public.increment_photographer_storage(uuid, bigint) from public, anon, authenticated;
grant execute on function public.increment_photographer_storage(uuid, bigint) to service_role;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.increment_photographer_storage(uuid, bigint);
-- drop function if exists public.ai_request_allowed(uuid, text, integer);
-- drop function if exists public.delete_pose_tag(text);
-- drop function if exists public.rename_pose_tag(text, text);
-- drop function if exists public.seed_pose_tag_vocabulary();
-- drop function if exists public.pose_tag_seed();
-- drop table if exists public.ai_usage_log;
-- drop table if exists public.pose_library_images;
-- drop table if exists public.pose_tag_vocabulary;
-- drop table if exists public.pose_tag_groups;
-- drop function if exists public.photographer_has_feature(uuid, text);
-- drop function if exists public.set_photographer_feature(uuid, text, boolean);
-- drop table if exists public.photographer_features;
-- commit;
