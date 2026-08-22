-- Migration: 026_zip_jobs_requester_check_fix.sql
-- Fixes an over-strict constraint from 025_zip_jobs.sql: the original
-- CHECK required exactly one of requested_by_viewer_id /
-- requested_by_photographer_id to be set. But a client-initiated
-- download's viewer isn't always known at request time (ClientGalleryView.jsx
-- initializes `viewer` to null and doesn't guarantee it's populated before
-- someone can click download) -- the original constraint would have
-- silently blocked legitimate anonymous downloads. Relaxed to simply
-- disallow BOTH being set at once, which is the only case that's actually
-- a data integrity problem.

ALTER TABLE zip_jobs DROP CONSTRAINT zip_jobs_requester_check;

ALTER TABLE zip_jobs ADD CONSTRAINT zip_jobs_requester_check CHECK (
  NOT (requested_by_viewer_id IS NOT NULL AND requested_by_photographer_id IS NOT NULL)
);
