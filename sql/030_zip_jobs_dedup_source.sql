-- Migration: 030_zip_jobs_dedup_source.sql
-- Feature: v1.5.8 -- Maintenance > Zip Job Monitor
--
-- Records which job a dedup cache-hit adopted its file from, so the
-- monitor UI can show "Cache hit" vs "Workflow" instead of the person
-- having to infer it from timing. Nullable -- only ever set on the
-- lightweight job row created by the dedup adoption path in
-- POST /zip-jobs; a real Workflow-driven job leaves this null.
--
-- ON DELETE SET NULL rather than CASCADE: if the original job row is
-- ever cleaned up, the adopted job's own status/download_r2_key are
-- still valid and complete on their own -- losing the pointer back to
-- a since-deleted source job shouldn't take the adopted row down with it.

ALTER TABLE zip_jobs
  ADD COLUMN dedup_source_job_id UUID REFERENCES zip_jobs(id) ON DELETE SET NULL;

COMMENT ON COLUMN zip_jobs.dedup_source_job_id IS
  'Set only on a dedup cache-hit job -- points at the ready job whose R2 file this one adopted instead of running a fresh Workflow. Null for normal Workflow-driven jobs.';
