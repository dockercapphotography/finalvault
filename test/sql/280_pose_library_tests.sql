-- Behaviour tests for 122 (pose library, tag vocabulary, feature flags,
-- AI usage gate, storage counter). Fresh copy, as postgres.
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

-- A = photographer, B = another photographer, Z = admin
insert into photographers (id, is_admin) values
  ('aaaaaaaa-0000-0000-0000-000000000001', false),
  ('bbbbbbbb-0000-0000-0000-000000000001', false),
  ('cccccccc-0000-0000-0000-000000000001', true);
insert into photographer_storage (photographer_id, bytes_used) values ('aaaaaaaa-0000-0000-0000-000000000001', 1000);

\echo '── feature flags: only an admin can turn them on'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select t_eq('off when no row', photographer_has_feature('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions'), false);
select t_fail($$insert into photographer_features (photographer_id, feature, enabled) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', true)$$, 'row-level security');
select t_fail($$select set_photographer_feature('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', true)$$, 'Admins only');
reset role;

set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000001';
select set_photographer_feature('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', true);
select t_eq('admin sees the flag', (select enabled from photographer_features where photographer_id = 'aaaaaaaa-0000-0000-0000-000000000001'), true);
select t_fail($$select set_photographer_feature('aaaaaaaa-0000-0000-0000-000000000001', 'teleport', true)$$, 'check');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select t_eq('owner reads own flag', (select count(*) from photographer_features), 1::bigint);
select t_eq('flag on', photographer_has_feature('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions'), true);
update photographer_features set enabled = false;
select t_eq('owner cannot switch it off either (no rows updated)', (select enabled from photographer_features), true);
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select t_eq('others see nothing', (select count(*) from photographer_features), 0::bigint);
reset role;

\echo '── vocabulary seed'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select t_eq('seed inserts the starter list', seed_pose_tag_vocabulary(), 119);
select t_eq('second seed is a no-op', seed_pose_tag_vocabulary(), 0);
select t_eq('11 groups', (select count(*) from pose_tag_groups), 11::bigint);
select t_eq('framing and angle are single choice', (select string_agg(name, ',' order by name) from pose_tag_groups where single_choice), 'angle,framing');
select t_eq('gender tags are manual only', (select string_agg(tag, ',' order by tag) from pose_tag_vocabulary where manual_only), 'man,woman');
select t_eq('definitions carried over', (select definition from pose_tag_vocabulary where tag = 'embrace from behind') like 'one person wraps%', true);
select t_eq('emphasis group present', (select count(*) from pose_tag_vocabulary v join pose_tag_groups g on g.id = v.group_id where g.name = 'emphasis'), 7::bigint);
select t_fail($$insert into pose_tag_vocabulary (photographer_id, group_id, tag) select photographer_id, id, 'Sitting ' from pose_tag_groups limit 1$$, 'check');
select t_fail($$insert into pose_tag_vocabulary (photographer_id, group_id, tag) select photographer_id, id, 'sitting' from pose_tag_groups limit 1$$, 'duplicate');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select t_eq('B sees no vocabulary of A', (select count(*) from pose_tag_vocabulary), 0::bigint);
select seed_pose_tag_vocabulary();
select t_fail($$insert into pose_tag_vocabulary (photographer_id, group_id, tag) select 'bbbbbbbb-0000-0000-0000-000000000001', id, 'x' from pose_tag_groups where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001' limit 1; insert into pose_tag_vocabulary (photographer_id, group_id, tag) values ('aaaaaaaa-0000-0000-0000-000000000001', (select id from pose_tag_groups limit 1), 'y')$$, 'row-level security');
reset role;
select t_fail($$insert into pose_tag_vocabulary (photographer_id, group_id, tag) select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'cross' from pose_tag_groups where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001' limit 1$$, 'foreign key');

\echo '── library images'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into pose_library_images (id, photographer_id, r2_key, file_size, tags, suggested_tags) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/1.webp', 100, '{solo,sitting}', '{leaning}'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/poses/library/2.webp', 100, '{couple,seated}', '{}');
select t_fail($$insert into pose_library_images (photographer_id, r2_key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'photographers/bbbbbbbb-0000-0000-0000-000000000001/poses/library/x.webp')$$, 'check');
select t_fail($$insert into pose_library_images (photographer_id, r2_key) values ('aaaaaaaa-0000-0000-0000-000000000001', 'photographers/aaaaaaaa-0000-0000-0000-000000000001/original/x.jpg')$$, 'check');
select t_fail($$insert into pose_library_images (photographer_id, r2_key) values ('bbbbbbbb-0000-0000-0000-000000000001', 'photographers/bbbbbbbb-0000-0000-0000-000000000001/poses/library/x.webp')$$, 'row-level security');
select t_eq('tag search with gin', (select count(*) from pose_library_images where tags @> '{solo}'), 1::bigint);

\echo '── rename / delete tags'
select rename_pose_tag('Sitting', 'seated ');
select t_eq('rename merged onto image 1', (select tags from pose_library_images where id = '11111111-0000-0000-0000-000000000001'), '{seated,solo}'::text[]);
select t_eq('image 2 unchanged and not duplicated', (select tags from pose_library_images where id = '11111111-0000-0000-0000-000000000002'), '{couple,seated}'::text[]);
select t_eq('vocabulary renamed', (select count(*) from pose_tag_vocabulary where tag in ('sitting', 'seated')), 1::bigint);
select rename_pose_tag('seated', 'standing');
select t_eq('rename onto an existing tag merges', (select count(*) from pose_tag_vocabulary where tag in ('seated', 'standing')), 1::bigint);
select t_eq('images follow the merge', (select tags from pose_library_images where id = '11111111-0000-0000-0000-000000000001'), '{solo,standing}'::text[]);
select rename_pose_tag('leaning', 'leaning in');
select t_eq('suggestions renamed too', (select suggested_tags from pose_library_images where id = '11111111-0000-0000-0000-000000000001'), '{"leaning in"}'::text[]);
select t_fail($$select rename_pose_tag('solo', '   ')$$, '1-60');
select delete_pose_tag('solo');
select t_eq('delete removes from images', (select tags from pose_library_images where id = '11111111-0000-0000-0000-000000000001'), '{standing}'::text[]);
select t_eq('delete removes from vocabulary', (select count(*) from pose_tag_vocabulary where tag = 'solo'), 0::bigint);
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select delete_pose_tag('couple');
reset role;
select t_eq('B cannot touch A''s images', (select tags from pose_library_images where id = '11111111-0000-0000-0000-000000000002'), '{couple,standing}'::text[]);
select t_eq('B''s own vocabulary lost couple', (select count(*) from pose_tag_vocabulary where photographer_id = 'bbbbbbbb-0000-0000-0000-000000000001' and tag = 'couple'), 0::bigint);

\echo '── AI gate and usage log'
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select t_fail($$select ai_request_allowed('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', 5)$$, 'permission denied');
select t_fail($$insert into ai_usage_log (photographer_id, feature, model) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', 'x')$$, 'permission denied');
reset role;
set role service_role;
select t_eq('allowed when on and under cap', ai_request_allowed('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', 2), true);
select t_eq('not allowed when the flag is off', ai_request_allowed('bbbbbbbb-0000-0000-0000-000000000001', 'ai_tag_suggestions', 2), false);
insert into ai_usage_log (photographer_id, feature, model, tokens_in, tokens_out, neurons) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', '@cf/google/gemma-4-26b-a4b-it', 1161, 114, 13.7),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', '@cf/google/gemma-4-26b-a4b-it', 1161, 114, 13.7);
select t_eq('blocked at the cap', ai_request_allowed('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', 2), false);
update ai_usage_log set created_at = now() - interval '25 hours';
select t_eq('older calls fall out of the window', ai_request_allowed('aaaaaaaa-0000-0000-0000-000000000001', 'ai_tag_suggestions', 2), true);
reset role;
set role authenticated;
select t_eq('owner reads own usage', (select count(*) from ai_usage_log), 2::bigint);
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000001';
select t_eq('others read none', (select count(*) from ai_usage_log), 0::bigint);
reset role;

\echo '── storage counter'
set role authenticated;
select t_fail($$select increment_photographer_storage('aaaaaaaa-0000-0000-0000-000000000001', 5)$$, 'permission denied');
reset role;
set role service_role;
select t_eq('adds', increment_photographer_storage('aaaaaaaa-0000-0000-0000-000000000001', 500), 1500::bigint);
select t_eq('subtracts, never below zero', increment_photographer_storage('aaaaaaaa-0000-0000-0000-000000000001', -99999), 0::bigint);
select t_eq('no storage row -> null', increment_photographer_storage('bbbbbbbb-0000-0000-0000-000000000001', 5), null::bigint);
reset role;

\echo '── anon has no access'
set role anon;
select t_fail($$select count(*) from pose_library_images$$, 'permission denied');
select t_fail($$select count(*) from pose_tag_vocabulary$$, 'permission denied');
select t_fail($$select count(*) from photographer_features$$, 'permission denied');
select t_fail($$select seed_pose_tag_vocabulary()$$, 'permission denied');
reset role;

\echo 'ALL 280 TESTS PASSED'
