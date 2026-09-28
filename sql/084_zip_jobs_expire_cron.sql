-- Migration: 084_zip_jobs_expire_cron.sql
-- Feature: v1.5.16 -- scheduled expiry of stale zip_jobs rows
-- Run after: 083_submit_form_session_type.sql
--
-- The R2 lifecycle rule (`zip-jobs-expiry`, prefix zip-jobs/, 7 days)
-- deletes the ZIP files themselves, but nothing ever updated the DB rows:
-- a job only flipped to 'expired' if someone opened its download link
-- after expiry (lazy mark in GET /zip-jobs/:id/download) or clicked
-- Expire in the Zip Job Monitor. Every other job stayed 'ready' forever,
-- so the monitor showed "Ready" next to "exp. expired", counted dead
-- files in its Ready stat, and offered an Expire button with nothing
-- left to delete.
--
-- This marks every 'ready' row past its expires_at as 'expired', hourly.
-- Covers dedup cache-hit rows too: their expires_at is already capped at
-- the source job's real expiry (see POST /zip-jobs), so they expire in
-- the same pass as the job whose file they share.
--
-- Verified against the live DB before writing (2026-09-28): no triggers
-- on zip_jobs (bulk UPDATE fires nothing), 'expired' is in
-- zip_jobs_status_check, and no existing cron job touches this table.
--
-- Status-only: rows are NOT deleted. Row retention/deletion is a
-- separate, still-open decision -- add it to this function later if
-- wanted, no new schedule needed.

CREATE OR REPLACE FUNCTION public.expire_stale_zip_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_count integer;
begin
  update zip_jobs
     set status = 'expired'
   where status = 'ready'
     and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- SECURITY DEFINER functions in `public` are callable through PostgREST's
-- /rpc/ by default -- this should only ever run from pg_cron, never from
-- a client. Harmless if called (it only does what the cron does), but
-- there's no reason to expose it.
REVOKE ALL ON FUNCTION public.expire_stale_zip_jobs() FROM PUBLIC, anon, authenticated;

-- Hourly at :15, offset from the existing jobs (digest 08:00, expiry
-- reminder 09:00, activity flush every minute). cron.schedule with a job
-- name updates in place if the name already exists, so re-running this
-- migration is safe.
SELECT cron.schedule(
  'expire-stale-zip-jobs',
  '15 * * * *',
  $$select public.expire_stale_zip_jobs();$$
);

-- One-time catch-up for rows already past expiry, instead of waiting for
-- the first scheduled run. Returns the number of rows it expired.
SELECT public.expire_stale_zip_jobs() AS rows_expired_now;
