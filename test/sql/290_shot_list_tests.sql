-- Behaviour tests for 123 + 124 (shot lists, viewers, favorites, comments,
-- client uploads, preview check). Fresh copy, as postgres.
\set ON_ERROR_STOP 1
\pset footer off
create or replace function t_fail(p_sql text, p_expect text) returns text language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_expect || '%' then return 'ok'; end if;
    raise exception 'FAIL: % -> wrong error: %', p_sql, sqlerrm;
  end;
  raise exception 'FAIL: expected error "%" but succeeded: %', p_expect, p_sql;
end $$;
create or replace function t_eq(p_label text, p_got anyelement, p_want anyelement) returns text language plpgsql as $$
begin
  if p_got is distinct from p_want then raise exception 'FAIL %: got %, want %', p_label, p_got, p_want; end if;
  return 'ok  ' || p_label;
end $$;
grant execute on function t_fail(text, text), t_eq(text, anyelement, anyelement) to authenticated, anon, service_role;

-- A owns session S1; B owns S2.
insert into photographers (id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000001');
insert into photographer_storage (photographer_id, bytes_used) values ('aaaaaaaa-0000-0000-0000-000000000001', 0);
insert into sessions (id, photographer_id, name, session_date) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Arcane shoot', '2026-12-05'),
  ('52000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Other shoot', '2026-12-06');
insert into pose_library_images (id, photographer_id, r2_key, title, tags) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp', 'Over the shoulder', '{solo,over-the-shoulder}'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/2.webp', 'Lean', '{solo,leaning}'),
  ('22222222-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'photographers/bbbbbbbb-0000-0000-0000-000000000001/poses/library/9.webp', 'B pose', '{}');

\echo '── photographer side'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into session_shot_lists (id, session_id, photographer_id, share_token) values
  ('a1000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'tokA');
select t_eq('photographer_id comes from the session, not the caller', (select photographer_id from session_shot_lists), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select t_fail($$insert into session_shot_lists (session_id) values ('52000000-0000-0000-0000-000000000001')$$, 'row-level security');
select t_fail($$insert into session_shot_lists (session_id) values ('51000000-0000-0000-0000-000000000001')$$, 'duplicate');
insert into shot_list_sections (id, shot_list_id, title, sort_order) values
  ('5ec00000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Look 1', 1);
insert into shot_list_items (id, shot_list_id, section_id, source, library_image_id, sort_order) values
  ('17000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '5ec00000-0000-0000-0000-000000000001', 'library', '11111111-0000-0000-0000-000000000001', 1),
  ('17000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', null, 'library', '11111111-0000-0000-0000-000000000002', 2);
select t_fail($$insert into shot_list_items (shot_list_id, source, library_image_id) values ('a1000000-0000-0000-0000-000000000001', 'library', '11111111-0000-0000-0000-000000000001')$$, 'duplicate');
select t_fail($$insert into shot_list_items (shot_list_id, source, library_image_id) values ('a1000000-0000-0000-0000-000000000001', 'library', '22222222-0000-0000-0000-000000000001')$$, 'not in this photographer');
select t_fail($$insert into shot_list_items (shot_list_id, source, r2_key) values ('a1000000-0000-0000-0000-000000000001', 'client', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp')$$, 'outside this shot list');
select t_fail($$insert into shot_list_items (shot_list_id, source) values ('a1000000-0000-0000-0000-000000000001', 'library')$$, 'not in this photographer');
select t_fail($$insert into shot_list_items (shot_list_id, source, library_image_id, r2_key) values ('a1000000-0000-0000-0000-000000000001', 'library', '11111111-0000-0000-0000-000000000002', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/x.webp')$$, 'check');
select t_fail($$delete from pose_library_images where id = '11111111-0000-0000-0000-000000000001'$$, 'foreign key');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select t_eq('B sees none of A''s lists', (select count(*) from session_shot_lists), 0::bigint);
select t_eq('B sees none of A''s items', (select count(*) from shot_list_items), 0::bigint);
insert into session_shot_lists (id, session_id, share_token) values ('b1000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'tokB');
insert into shot_list_sections (id, shot_list_id, title) values ('5ec00000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'B section');
select t_fail($$insert into shot_list_sections (shot_list_id, title) values ('a1000000-0000-0000-0000-000000000001', 'x')$$, 'row-level security');
reset role;
select t_fail($$update shot_list_items set section_id = '5ec00000-0000-0000-0000-000000000002' where id = '17000000-0000-0000-0000-000000000002'$$, 'foreign key');

\echo '── visitors: gate and page data'
create temp table v (who text primary key, id uuid);
grant select, insert on v to anon, authenticated, service_role;
set role anon;
select t_fail($$select count(*) from session_shot_lists$$, 'permission denied');
select t_fail($$select count(*) from shot_list_items$$, 'permission denied');
select t_eq('unknown token -> null page', get_shot_list_by_token('nope') is null, true);
select t_fail($$select get_or_create_shot_list_viewer_by_token('nope', 'x@x.com', 'X')$$, 'not available');
insert into v values ('ava', (get_or_create_shot_list_viewer_by_token('tokA', ' Ava@X.com ', 'Ava')).id);
select t_eq('same email returns the same viewer', (get_or_create_shot_list_viewer_by_token('tokA', 'ava@x.com', null)).id, (select id from v where who = 'ava'));
insert into v values ('jo', (get_or_create_shot_list_viewer_by_token('tokA', 'jo@x.com', 'Jo')).id);
select t_eq('page shows 2 approved items', json_array_length(get_shot_list_by_token('tokA') -> 'items'), 2);
select t_eq('session name shown', get_shot_list_by_token('tokA') -> 'session' ->> 'name', 'Arcane shoot');
select t_eq('tags of library poses shown', get_shot_list_by_token('tokA') -> 'items' -> 0 -> 'tags' ->> 0, 'solo');
select t_eq('no viewer emails anywhere', get_shot_list_by_token('tokA', (select id from v where who = 'ava'))::text like '%@x.com%', false);

\echo '── favorites (visible to everyone on the list)'
select t_eq('favorite on', toggle_shot_list_favorite((select id from v where who = 'ava'), '17000000-0000-0000-0000-000000000001'), true);
select t_eq('everyone sees who favorited', get_shot_list_by_token('tokA') -> 'items' -> 0 -> 'favorited_by' ->> 0, 'Ava');
select t_eq('favorited_by_me for Ava', (get_shot_list_by_token('tokA', (select id from v where who = 'ava')) -> 'items' -> 0 ->> 'favorited_by_me')::boolean, true);
select t_eq('favorite off', toggle_shot_list_favorite((select id from v where who = 'ava'), '17000000-0000-0000-0000-000000000001'), false);
select t_fail($$select toggle_shot_list_favorite((select id from v where who = 'ava'), '00000000-0000-0000-0000-000000000000')$$, 'not in this shot list');
reset role;
insert into shot_list_items (id, shot_list_id, source, library_image_id) values ('17000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-000000000001', 'library', '22222222-0000-0000-0000-000000000001');
set role anon;
select t_fail($$select toggle_shot_list_favorite((select id from v where who = 'ava'), '17000000-0000-0000-0000-0000000000b1')$$, 'not in this shot list');

\echo '── comments'
select t_eq('list comment', add_shot_list_comment((select id from v where who = 'ava'), null, '  Love these!  ') ->> 'body', 'Love these!');
select t_eq('item comment', add_shot_list_comment((select id from v where who = 'ava'), '17000000-0000-0000-0000-000000000002', 'Can we do this one?') ->> 'author', 'Ava');
select t_fail($$select add_shot_list_comment((select id from v where who = 'ava'), null, '   ')$$, 'empty');
select t_fail($$select add_shot_list_comment((select id from v where who = 'ava'), null, repeat('x', 2001))$$, 'too long');
select t_eq('page shows 2 comments', json_array_length(get_shot_list_by_token('tokA') -> 'comments'), 2);
reset role;

\echo '── photographer replies and moderates'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into shot_list_comments (shot_list_id, photographer_id, body) values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Yes!');
select t_fail($$insert into shot_list_comments (shot_list_id, viewer_id, body) select 'a1000000-0000-0000-0000-000000000001', id, 'fake' from v where who = 'ava'$$, 'row-level security');
update shot_list_comments set deleted_at = now() where body = 'Love these!';
reset role;
set role anon;
select t_eq('hidden comment gone, reply shown as Photographer',
  (select string_agg(c ->> 'author', ',' order by c ->> 'created_at') from json_array_elements(get_shot_list_by_token('tokA') -> 'comments') c), 'Ava,Photographer');
reset role;

\echo '── client uploads (r2-worker, service role)'
set role anon;
select t_fail($$select record_shot_list_upload('tokA', (select id from v where who = 'ava'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u1.webp', 1000, 100, 100)$$, 'permission denied');
reset role;
set role service_role;
select t_eq('upload pending when approval is on',
  record_shot_list_upload('tokA', (select id from v where who = 'ava'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u1.webp', 1000, 800, 1200) ->> 'status', 'pending');
select t_fail($$select record_shot_list_upload('tokA', (select id from v where who = 'ava'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/b1000000-0000-0000-0000-000000000001/u2.webp', 1000, 1, 1)$$, 'outside this shot list');
select t_fail($$select record_shot_list_upload('tokB', (select id from v where who = 'ava'), 'photographers/bbbbbbbb-0000-0000-0000-000000000001/poses/lists/b1000000-0000-0000-0000-000000000001/u3.webp', 1000, 1, 1)$$, 'Viewer not on this shot list');
select t_fail($$select record_shot_list_upload('tokA', (select id from v where who = 'ava'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/big.webp', 6000000, 1, 1)$$, 'File size');
reset role;
set role anon;
select t_eq('uploader sees own pending item', json_array_length(get_shot_list_by_token('tokA', (select id from v where who = 'ava')) -> 'items'), 3);
select t_eq('others do not', json_array_length(get_shot_list_by_token('tokA', (select id from v where who = 'jo')) -> 'items'), 2);
select t_eq('uploads_used counted', (get_shot_list_by_token('tokA', (select id from v where who = 'ava')) -> 'viewer' ->> 'uploads_used')::int, 1);
select t_fail($$select toggle_shot_list_favorite((select id from v where who = 'ava'), (get_shot_list_by_token('tokA', (select id from v where who = 'ava')) -> 'items' -> 2 ->> 'id')::uuid)$$, 'not in this shot list');
reset role;
select t_eq('bytes added to storage', (select bytes_used from photographer_storage where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1000::bigint);

\echo '── preview check'
set role service_role;
select t_eq('approved library key visible', shot_list_key_visible('tokA', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp'), true);
select t_eq('pending upload hidden from strangers', shot_list_key_visible('tokA', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u1.webp'), false);
select t_eq('pending upload visible to its uploader', shot_list_key_visible('tokA', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u1.webp', (select id from v where who = 'ava')), true);
select t_eq('another list''s key not visible through tokA', shot_list_key_visible('tokA', 'photographers/bbbbbbbb-0000-0000-0000-000000000001/poses/library/9.webp'), false);
select t_eq('library pose not on the list not visible', shot_list_key_visible('tokB', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp'), false);
reset role;

\echo '── approval, limits, lock, off switch'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update shot_list_items set status = 'approved' where status = 'pending';
update session_shot_lists set max_uploads_per_viewer = 1, require_upload_approval = false;
reset role;
set role service_role;
select t_fail($$select record_shot_list_upload('tokA', (select id from v where who = 'ava'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u4.webp', 10, 1, 1)$$, 'Upload limit');
select t_eq('approval off -> approved straight away',
  record_shot_list_upload('tokA', (select id from v where who = 'jo'), 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/lists/a1000000-0000-0000-0000-000000000001/u5.webp', 10, 1, 1) ->> 'status', 'approved');
reset role;
set role authenticated;
update session_shot_lists set is_locked = true;
reset role;
set role anon;
select t_fail($$select toggle_shot_list_favorite((select id from v where who = 'ava'), '17000000-0000-0000-0000-000000000001')$$, 'locked');
select t_fail($$select add_shot_list_comment((select id from v where who = 'ava'), null, 'hi')$$, 'locked');
select t_eq('locked list still readable', json_array_length(get_shot_list_by_token('tokA') -> 'items'), 4);
reset role;
set role authenticated;
update session_shot_lists set is_locked = false, allow_comments = false;
reset role;
set role anon;
select t_fail($$select add_shot_list_comment((select id from v where who = 'ava'), null, 'hi')$$, 'turned off');
reset role;
set role authenticated;
update session_shot_lists set is_active = false;
reset role;
set role anon;
select t_eq('inactive list -> null page', get_shot_list_by_token('tokA') is null, true);
select t_fail($$select toggle_shot_list_favorite((select id from v where who = 'ava'), '17000000-0000-0000-0000-000000000001')$$, 'not available');
reset role;
set role service_role;
select t_eq('inactive list hides keys', shot_list_key_visible('tokA', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp'), false);
reset role;

\echo '── cleanup cascades'
delete from sessions where id = '51000000-0000-0000-0000-000000000001';
select t_eq('deleting the session removes its list and items', (select count(*) from shot_list_items where shot_list_id = 'a1000000-0000-0000-0000-000000000001'), 0::bigint);
select t_eq('library poses survive', (select count(*) from pose_library_images where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 2::bigint);

\echo 'ALL 290 TESTS PASSED'
