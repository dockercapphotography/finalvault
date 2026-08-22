-- Migration: 027_zip_jobs_skipped_images.sql
-- Feature: Tier 3 async ZIP queue -- records which images (if any) were
-- skipped during a job, per the skip-and-continue retry decision (spec
-- section 7, question 3): a per-image fetch that exhausts Workflows'
-- default retries gets skipped and noted, not treated as a whole-job
-- failure. The table had nowhere to record what got skipped until now.

ALTER TABLE zip_jobs
  ADD COLUMN skipped_images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Expected shape: [{"key": "...", "fileName": "...", "error": "..."}, ...]
COMMENT ON COLUMN zip_jobs.skipped_images IS
  'Images that could not be fetched after exhausting default Workflow retries. Job still completes; these are simply missing from the ZIP. Array of {key, fileName, error}.';
