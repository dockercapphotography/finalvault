-- 124_shot_list_viewer_rpcs.sql
-- v1.7.0 step 1c: what the public /poses/:token page and the r2-worker call.
-- Same pattern as the gallery viewer functions (101): visitors have no table
-- access at all; every read and write goes through these SECURITY DEFINER
-- functions, and the viewer id they get back is their credential.
--
--   viewer_open_shot_list_id(viewer)        -> list id if the list is active
--   get_or_create_shot_list_viewer_by_token -> name/email gate
--   get_shot_list_by_token(token, viewer)   -> everything the page shows
--   toggle_shot_list_favorite(viewer, item)
--   add_shot_list_comment(viewer, item, body)
--   record_shot_list_upload(...)            -> r2-worker only (service role),
--                                              after it has stored the file
--   shot_list_key_visible(token, key, viewer) -> r2-worker /preview check
--
-- Run after: 123_shot_lists.sql

begin;

-- List id for a viewer, only while the list is active. NULL otherwise.
create or replace function public.viewer_open_shot_list_id(p_viewer_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select l.id
    from shot_list_viewers v
    join session_shot_lists l on l.id = v.shot_list_id
   where v.id = p_viewer_id and l.is_active
$$;

-- Same matching as get_or_create_gallery_viewer_by_token: reuse the viewer
-- with the same (normalised) email on this list, otherwise create one.
create or replace function public.get_or_create_shot_list_viewer_by_token(
  p_token text, p_email text default null, p_display_name text default null)
returns shot_list_viewers language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid;
  v_viewer shot_list_viewers;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_name text := nullif(btrim(p_display_name), '');
begin
  select id into v_list_id from session_shot_lists where share_token = p_token and is_active;
  if v_list_id is null then
    raise exception 'Shot list not available';
  end if;
  if length(v_name) > 80 or length(v_email) > 254 then
    raise exception 'Name or email too long';
  end if;

  if v_email is not null then
    select * into v_viewer from shot_list_viewers
     where shot_list_id = v_list_id and lower(btrim(email)) = v_email
     order by last_seen_at desc nulls last limit 1;
    if v_viewer.id is not null then
      update shot_list_viewers
         set last_seen_at = now(), display_name = coalesce(v_name, display_name)
       where id = v_viewer.id
      returning * into v_viewer;
      return v_viewer;
    end if;
  end if;

  insert into shot_list_viewers (shot_list_id, session_id, email, display_name)
  values (v_list_id, replace(gen_random_uuid()::text, '-', ''), v_email, v_name)
  returning * into v_viewer;
  return v_viewer;
end $$;

-- Everything the public page needs. Items: approved ones, plus the caller's
-- own pending uploads (so they see what they sent). Viewer emails are never
-- returned, only display names.
create or replace function public.get_shot_list_by_token(p_token text, p_viewer_id uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  l session_shot_lists;
  v_viewer uuid;
begin
  select * into l from session_shot_lists where share_token = p_token and is_active;
  if l.id is null then
    return null;
  end if;
  select id into v_viewer from shot_list_viewers where id = p_viewer_id and shot_list_id = l.id;

  return json_build_object(
    'id', l.id,
    'photographer_id', l.photographer_id,
    'intro_note', l.intro_note,
    'allow_favorites', l.allow_favorites,
    'allow_comments', l.allow_comments,
    'allow_uploads', l.allow_uploads,
    'require_upload_approval', l.require_upload_approval,
    'max_uploads_per_viewer', l.max_uploads_per_viewer,
    'is_locked', l.is_locked,
    'session', (select json_build_object('name', s.name, 'session_date', s.session_date)
                  from sessions s where s.id = l.session_id),
    'viewer', (select json_build_object('id', v.id, 'display_name', v.display_name,
                 'uploads_used', (select count(*) from shot_list_items i
                                   where i.uploaded_by_viewer_id = v.id and i.status <> 'rejected'))
                 from shot_list_viewers v where v.id = v_viewer),
    'sections', (select coalesce(json_agg(json_build_object('id', sc.id, 'title', sc.title)
                   order by sc.sort_order, sc.created_at), '[]'::json)
                   from shot_list_sections sc where sc.shot_list_id = l.id),
    'items', (select coalesce(json_agg(json_build_object(
                'id', i.id,
                'section_id', i.section_id,
                'source', i.source,
                'image_key', coalesce(i.r2_key, p.r2_key),
                'width', coalesce(i.width, p.width),
                'height', coalesce(i.height, p.height),
                'title', p.title,
                'tags', coalesce(p.tags, '{}'),
                'note', i.note,
                'status', i.status,
                'mine', i.uploaded_by_viewer_id is not distinct from v_viewer and v_viewer is not null,
                'uploaded_by', uv.display_name,
                'favorited_by', (select coalesce(json_agg(fv.display_name order by f.created_at), '[]'::json)
                                   from shot_list_favorites f join shot_list_viewers fv on fv.id = f.viewer_id
                                  where f.item_id = i.id),
                'favorited_by_me', exists (select 1 from shot_list_favorites f
                                             where f.item_id = i.id and f.viewer_id = v_viewer)
              ) order by i.sort_order, i.created_at), '[]'::json)
                from shot_list_items i
                left join pose_library_images p on p.id = i.library_image_id
                left join shot_list_viewers uv on uv.id = i.uploaded_by_viewer_id
               where i.shot_list_id = l.id
                 and (i.status = 'approved'
                      or (i.status = 'pending' and v_viewer is not null and i.uploaded_by_viewer_id = v_viewer))),
    'comments', (select coalesce(json_agg(json_build_object(
                   'id', c.id, 'item_id', c.item_id, 'body', c.body, 'created_at', c.created_at,
                   'author', coalesce(cv.display_name, 'Photographer'),
                   'from_photographer', c.photographer_id is not null,
                   'mine', c.viewer_id is not distinct from v_viewer and v_viewer is not null
                 ) order by c.created_at), '[]'::json)
                   from shot_list_comments c
                   left join shot_list_viewers cv on cv.id = c.viewer_id
                  where c.shot_list_id = l.id and c.deleted_at is null)
  );
end $$;

create or replace function public.toggle_shot_list_favorite(p_viewer_id uuid, p_item_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid := viewer_open_shot_list_id(p_viewer_id);
  l session_shot_lists;
  v_removed int;
begin
  if v_list_id is null then
    raise exception 'Shot list not available';
  end if;
  select * into l from session_shot_lists where id = v_list_id;
  if not l.allow_favorites then raise exception 'Favorites are turned off'; end if;
  if l.is_locked then raise exception 'This shot list is locked'; end if;
  if not exists (select 1 from shot_list_items
                  where id = p_item_id and shot_list_id = v_list_id and status = 'approved') then
    raise exception 'Pose not in this shot list';
  end if;

  delete from shot_list_favorites where viewer_id = p_viewer_id and item_id = p_item_id;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    return false;
  end if;
  insert into shot_list_favorites (shot_list_id, item_id, viewer_id)
  values (v_list_id, p_item_id, p_viewer_id)
  on conflict (item_id, viewer_id) do nothing;
  update shot_list_viewers set last_seen_at = now() where id = p_viewer_id;
  return true;
end $$;

-- p_item_id NULL = a comment on the whole list.
create or replace function public.add_shot_list_comment(p_viewer_id uuid, p_item_id uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid := viewer_open_shot_list_id(p_viewer_id);
  l session_shot_lists;
  c shot_list_comments;
begin
  if v_list_id is null then
    raise exception 'Shot list not available';
  end if;
  select * into l from session_shot_lists where id = v_list_id;
  if not l.allow_comments then raise exception 'Comments are turned off'; end if;
  if l.is_locked then raise exception 'This shot list is locked'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then raise exception 'Comment is empty'; end if;
  if length(btrim(p_body)) > 2000 then raise exception 'Comment is too long'; end if;
  if p_item_id is not null and not exists (
       select 1 from shot_list_items
        where id = p_item_id and shot_list_id = v_list_id
          and (status = 'approved' or (status = 'pending' and uploaded_by_viewer_id = p_viewer_id))) then
    raise exception 'Pose not in this shot list';
  end if;

  insert into shot_list_comments (shot_list_id, item_id, viewer_id, body)
  values (v_list_id, p_item_id, p_viewer_id, btrim(p_body))
  returning * into c;
  update shot_list_viewers set last_seen_at = now() where id = p_viewer_id;

  return json_build_object('id', c.id, 'item_id', c.item_id, 'body', c.body, 'created_at', c.created_at,
    'author', (select display_name from shot_list_viewers where id = p_viewer_id),
    'from_photographer', false, 'mine', true);
end $$;

-- Called by the r2-worker (service role) AFTER it has stored the file at the
-- key it built itself. Re-checks everything, records the item (pending when
-- approval is on) and adds the bytes to the photographer's storage. Raises
-- if the upload isn't allowed; the worker then deletes the R2 object.
create or replace function public.record_shot_list_upload(
  p_token text, p_viewer_id uuid, p_r2_key text, p_file_size bigint, p_width integer, p_height integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  l session_shot_lists;
  v_used integer;
  i shot_list_items;
begin
  select * into l from session_shot_lists where share_token = p_token and is_active for update;
  if l.id is null then raise exception 'Shot list not available'; end if;
  if viewer_open_shot_list_id(p_viewer_id) is distinct from l.id then
    raise exception 'Viewer not on this shot list';
  end if;
  if not l.allow_uploads then raise exception 'Uploads are turned off'; end if;
  if l.is_locked then raise exception 'This shot list is locked'; end if;
  if p_file_size is null or p_file_size <= 0 or p_file_size > 5 * 1024 * 1024 then
    raise exception 'File size out of range';
  end if;

  select count(*) into v_used from shot_list_items
   where shot_list_id = l.id and uploaded_by_viewer_id = p_viewer_id and status <> 'rejected';
  if v_used >= l.max_uploads_per_viewer then
    raise exception 'Upload limit reached';
  end if;

  insert into shot_list_items (shot_list_id, source, r2_key, file_size, width, height,
                               uploaded_by_viewer_id, status, sort_order)
  values (l.id, 'client', p_r2_key, p_file_size, p_width, p_height, p_viewer_id,
          case when l.require_upload_approval then 'pending' else 'approved' end,
          coalesce((select max(sort_order) + 1 from shot_list_items where shot_list_id = l.id), 0))
  returning * into i;

  perform increment_photographer_storage(l.photographer_id, p_file_size);
  update shot_list_viewers set last_seen_at = now() where id = p_viewer_id;

  return json_build_object('id', i.id, 'status', i.status, 'image_key', i.r2_key,
                           'photographer_id', l.photographer_id);
end $$;

-- /preview check for the r2-worker (service role): may this visitor see this
-- key through this shot list? Approved items (client uploads or the library
-- images used on the list), plus the viewer's own pending uploads.
create or replace function public.shot_list_key_visible(p_token text, p_key text, p_viewer_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from session_shot_lists l
      join shot_list_items i on i.shot_list_id = l.id
      left join pose_library_images p on p.id = i.library_image_id
     where l.share_token = p_token and l.is_active
       and coalesce(i.r2_key, p.r2_key) = p_key
       and (i.status = 'approved'
            or (i.status = 'pending' and p_viewer_id is not null and i.uploaded_by_viewer_id = p_viewer_id))
  )
$$;

-- ── Grants ───────────────────────────────────────────────────────────────
revoke all on function public.viewer_open_shot_list_id(uuid) from public;
grant execute on function public.viewer_open_shot_list_id(uuid) to anon, authenticated, service_role;
revoke all on function public.get_or_create_shot_list_viewer_by_token(text, text, text) from public;
grant execute on function public.get_or_create_shot_list_viewer_by_token(text, text, text) to anon, authenticated, service_role;
revoke all on function public.get_shot_list_by_token(text, uuid) from public;
grant execute on function public.get_shot_list_by_token(text, uuid) to anon, authenticated, service_role;
revoke all on function public.toggle_shot_list_favorite(uuid, uuid) from public;
grant execute on function public.toggle_shot_list_favorite(uuid, uuid) to anon, authenticated, service_role;
revoke all on function public.add_shot_list_comment(uuid, uuid, text) from public;
grant execute on function public.add_shot_list_comment(uuid, uuid, text) to anon, authenticated, service_role;
revoke all on function public.record_shot_list_upload(text, uuid, text, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.record_shot_list_upload(text, uuid, text, bigint, integer, integer) to service_role;
revoke all on function public.shot_list_key_visible(text, text, uuid) from public, anon, authenticated;
grant execute on function public.shot_list_key_visible(text, text, uuid) to service_role;

commit;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- begin;
-- drop function if exists public.shot_list_key_visible(text, text, uuid);
-- drop function if exists public.record_shot_list_upload(text, uuid, text, bigint, integer, integer);
-- drop function if exists public.add_shot_list_comment(uuid, uuid, text);
-- drop function if exists public.toggle_shot_list_favorite(uuid, uuid);
-- drop function if exists public.get_shot_list_by_token(text, uuid);
-- drop function if exists public.get_or_create_shot_list_viewer_by_token(text, text, text);
-- drop function if exists public.viewer_open_shot_list_id(uuid);
-- commit;
