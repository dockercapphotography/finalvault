-- Migration: 031_zip_jobs_final_size.sql
-- Feature: v1.5.8 -- Zip Job Monitor UI, size column
--
-- The Workflow already computes the finished ZIP's exact byte size
-- (zipResult.totalSize, from the build-and-upload-zip step) but never
-- persisted it anywhere -- estimated_total_bytes is only ever an
-- estimate based on ORIGINAL file sizes, not the actual archive. This
-- column stores the real, final number so the monitor UI can show it
-- without an extra R2 HEAD request per row.
--
-- Nullable: only set once a job reaches 'ready' (workflow-driven jobs at
-- their own mark-ready step; dedup-adopted jobs copy it from the source
-- job at insert time, since they point at the same R2 object).

ALTER TABLE zip_jobs
  ADD COLUMN final_size_bytes BIGINT;

COMMENT ON COLUMN zip_jobs.final_size_bytes IS
  'Exact byte size of the finished ZIP file at download_r2_key. Null until status = ready.';
