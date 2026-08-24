-- Migration: 029_zip_jobs_size_and_dedup.sql
-- Feature: v1.5.8 -- web-size async ZIP queue + content-based dedup
-- Run after: 028_get_gallery_photographer_email.sql
--
-- 1. `size` distinguishes a hi-res job (raw originals) from a web-size job
--    (resized + watermarked JPEGs), so the same zip_jobs table and Workflow
--    can serve both -- ZipQueueWorkflow branches its fetch step on this
--    column instead of duplicating the whole table/pipeline for web-size.
--
-- 2. `image_keys_hash` supports the dedup feature from the roadmap: before
--    triggering a new Workflow, POST /zip-jobs hashes the sorted requested
--    image keys + size and looks for an existing ready, non-expired job
--    with the same gallery_id + hash + size. A hit skips the Workflow
--    entirely and adopts the existing download_r2_key. Nullable because
--    existing rows (pre-dedup) have no hash to backfill, and a hash is
--    only meaningful once a job reaches 'ready' -- no point computing one
--    for a job that fails or gets skipped.
--
-- Index is partial (status = 'ready') since dedup lookups only ever care
-- about ready jobs -- queued/processing/failed/expired rows would never
-- be a valid adoption target anyway.

ALTER TABLE zip_jobs
  ADD COLUMN size TEXT NOT NULL DEFAULT 'hires'
    CHECK (size IN ('hires', 'web')),
  ADD COLUMN image_keys_hash TEXT;

CREATE INDEX idx_zip_jobs_dedup
  ON zip_jobs (gallery_id, size, image_keys_hash)
  WHERE status = 'ready';
