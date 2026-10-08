-- 092_realtime_gallery_activity.sql
-- v1.5.17: lets the notification bell receive gallery activity (views,
-- favorites, comments, downloads) live.
--
-- Live publication on 2026-10-08: clients, contracts, notifications,
-- session_submissions, sessions, signup_slots -- gallery_activity_log was
-- missing, and subscribing to a table outside the publication made
-- Realtime reject the bell's whole channel.
--
-- Safe to publish: Realtime applies RLS per subscriber, and the table's
-- only SELECT policy is "Photographers can view own gallery activity"
-- (authenticated, own galleries). anon has INSERT only, so anonymous
-- subscribers receive nothing.
--
-- Idempotent: only adds the table if it isn't already published.
--
-- Run after: 091_review_request_edit_and_suggested_photo.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gallery_activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_activity_log;
  END IF;
END $$;
