-- Migration: 077_batch_activity_push_notifications.sql
-- Changes favorite/download push from "one push per click" to "one push
-- per browsing session" via a quiet-period batch, photographer-configurable.
-- Comments are untouched -- still instant, per Nick's call.
--
-- Mechanism (pg_cron is confirmed enabled on this project; reusing it
-- rather than introducing a second scheduling method):
--   1. notify_gallery_activity_push() no longer fires push for favorite/
--      download at all -- only comment, same as before.
--   2. Favorite/download rows just sit in gallery_activity_log with
--      pushed_at = null until flush_activity_batches() picks them up.
--   3. flush_activity_batches() runs every minute via pg_cron. For each
--      (gallery, viewer, favorite-or-download) group with unpushed rows,
--      it only sends a batch push once the group's most recent event is
--      older than that photographer's activity_batch_minutes setting --
--      a newer unpushed row in the group means they're still actively
--      favoriting/downloading, so it waits.
--   4. send-activity-push gets a second 'batch' mode alongside the
--      existing 'single' mode (still used for comments). Also improves
--      viewer-name resolution for both modes: matches the viewer's email
--      against this photographer's own clients first (a real client name
--      beats a bare email), and comments now lead with the actual
--      comment text instead of generic "left a comment".
--
-- Run after: 076_bell_and_activity_push_notifications.sql

-- ── 1. Schema additions ─────────────────────────────────────────────

ALTER TABLE gallery_activity_log ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- Backfill existing rows as already-pushed so the first cron run doesn't
-- suddenly try to batch-notify about months of historical activity.
UPDATE gallery_activity_log SET pushed_at = now() WHERE pushed_at IS NULL;

ALTER TABLE push_notification_preferences
  ADD COLUMN IF NOT EXISTS activity_batch_minutes integer NOT NULL DEFAULT 5;

ALTER TABLE push_notification_preferences
  DROP CONSTRAINT IF EXISTS activity_batch_minutes_positive;
ALTER TABLE push_notification_preferences
  ADD CONSTRAINT activity_batch_minutes_positive CHECK (activity_batch_minutes >= 1);

-- ── 2. Trigger: comment only from here on ──────────────────────────

CREATE OR REPLACE FUNCTION public.notify_gallery_activity_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_photographer_id uuid;
  v_push_enabled boolean;
begin
  -- Favorite/download are handled entirely by flush_activity_batches()
  -- now, not here -- a single browsing session can generate dozens of
  -- these in quick succession, and one push per click would be far too
  -- noisy. Comments stay instant: each one is individually worth seeing
  -- right away, unlike a run of clicks.
  if new.action <> 'comment' then
    return new;
  end if;

  select g.photographer_id into v_photographer_id
  from galleries g where g.id = new.gallery_id;

  if v_photographer_id is null then
    return new;
  end if;

  select comment into v_push_enabled from push_notification_preferences where photographer_id = v_photographer_id;

  if coalesce(v_push_enabled, false) then
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'activity_push_secret';

    perform net.http_post(
      url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-activity-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Activity-Push-Secret', v_secret
      ),
      body := jsonb_build_object('mode', 'single', 'activityLogId', new.id)
    );
  end if;

  -- Tracks "has this row been considered for push", not "did a push
  -- actually fire" -- keeps pushed_at consistently non-null for every
  -- action type, even though flush_activity_batches() never looks at
  -- comment rows regardless.
  update gallery_activity_log set pushed_at = now() where id = new.id;

  return new;
end;
$function$;

-- Trigger itself is unchanged (still AFTER INSERT on gallery_activity_log),
-- only the function body above changed -- no need to re-create it.

-- ── 3. Batch flush function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.flush_activity_batches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_group record;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'activity_push_secret';

  -- Inner join to push_notification_preferences deliberately excludes
  -- any photographer with no preferences row at all -- favorite/download
  -- default OFF (019), so no row means no batching, same effective
  -- result as coalescing to false elsewhere in this codebase.
  for v_group in
    select
      l.gallery_id,
      l.viewer_id,
      case when l.action = 'favorite' then 'favorite' else 'download' end as category,
      count(*) as event_count,
      array_agg(l.id) as log_ids
    from gallery_activity_log l
    join galleries g on g.id = l.gallery_id
    join push_notification_preferences p on p.photographer_id = g.photographer_id
    where l.pushed_at is null
      and l.action in ('favorite', 'download_single', 'download_all')
      and (
        (l.action = 'favorite' and coalesce(p.favorite, false))
        or (l.action in ('download_single', 'download_all') and coalesce(p.download, false))
      )
    group by l.gallery_id, l.viewer_id, category, p.activity_batch_minutes
    having max(l.occurred_at) < now() - (p.activity_batch_minutes || ' minutes')::interval
  loop
    perform net.http_post(
      url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-activity-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Activity-Push-Secret', v_secret
      ),
      body := jsonb_build_object(
        'mode', 'batch',
        'galleryId', v_group.gallery_id,
        'viewerId', v_group.viewer_id,
        'category', v_group.category,
        'count', v_group.event_count
      )
    );

    update gallery_activity_log set pushed_at = now() where id = any(v_group.log_ids);
  end loop;
end;
$function$;

-- ── 4. Schedule it (idempotent -- safe to re-run this migration) ──────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'flush-activity-batches') then
    perform cron.unschedule('flush-activity-batches');
  end if;
end $$;

select cron.schedule(
  'flush-activity-batches',
  '* * * * *',
  $$select public.flush_activity_batches();$$
);

-- ── Deployment notes ─────────────────────────────────────────────────
-- No new secrets needed -- reuses activity_push_secret from 076.
-- Redeploy the updated Edge Function (provided separately):
--   supabase functions deploy send-activity-push --no-verify-jwt
