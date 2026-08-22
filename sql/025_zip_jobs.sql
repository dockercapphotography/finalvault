-- Migration: 025_zip_jobs.sql
-- Feature: Tier 3 async ZIP job queue -- see docs/tier3-async-zip-queue-spec.md
-- Run after: 024_photographer_domains.sql
--
-- Client-facing reads/writes for this table happen entirely through the
-- r2-worker (GET /zip-jobs/:id/download), which validates the share token
-- itself via verifyShareToken() and uses the Supabase service key -- the
-- same pattern already used by download.js and zip.js. It bypasses RLS
-- by design, so no anon policy is needed here, unlike what the original
-- spec draft assumed. RLS below only covers the photographer's own
-- dashboard reading their own galleries' jobs via a normal JWT session.

CREATE TABLE zip_jobs (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id                    UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  requested_by_viewer_id        UUID REFERENCES gallery_viewers(id) ON DELETE SET NULL,
  requested_by_photographer_id  UUID REFERENCES photographers(id) ON DELETE SET NULL,
  status                        TEXT NOT NULL DEFAULT 'queued'
                                   CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'expired')),
  image_count                   INTEGER NOT NULL,
  images_completed              INTEGER NOT NULL DEFAULT 0,
  estimated_total_bytes         BIGINT,
  download_r2_key               TEXT,
  error_message                 TEXT,
  notify_email                  TEXT NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at                    TIMESTAMPTZ,
  completed_at                  TIMESTAMPTZ,
  expires_at                    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),

  CONSTRAINT zip_jobs_requester_check CHECK (
    (requested_by_viewer_id IS NOT NULL AND requested_by_photographer_id IS NULL)
    OR (requested_by_viewer_id IS NULL AND requested_by_photographer_id IS NOT NULL)
  )
);

CREATE INDEX idx_zip_jobs_gallery ON zip_jobs (gallery_id, created_at DESC);
CREATE INDEX idx_zip_jobs_status ON zip_jobs (status) WHERE status IN ('queued', 'processing');

ALTER TABLE zip_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can read own galleries' zip jobs"
  ON zip_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM galleries g
      WHERE g.id = zip_jobs.gallery_id
      AND g.photographer_id = auth.uid()
    )
  );
