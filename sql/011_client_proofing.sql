-- Migration: 011_client_proofing.sql
-- Feature: Client Proofing (Selection Submission) — v1.1.0
-- Run after: 010_rls_policies.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New column on galleries: allow_proofing
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN allow_proofing BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. New column on notification_preferences: notify_selections
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE notification_preferences
  ADD COLUMN notify_selections BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. New table: gallery_selections
--    Point-in-time snapshot of a client's submitted selection.
--    Separate from gallery_favorites — this record is the "submitted" state
--    and must not mutate as favorites change (except on an explicit revision).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE gallery_selections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID        NOT NULL REFERENCES galleries(id)       ON DELETE CASCADE,
  viewer_id     UUID        NOT NULL REFERENCES gallery_viewers(id)  ON DELETE CASCADE,
  image_ids     UUID[]      NOT NULL,         -- snapshot of selected image IDs at submit time
  image_count   INT         NOT NULL,         -- denormalized for quick display
  viewer_name   TEXT        NOT NULL,         -- denormalized (viewer name at submission time)
  viewer_email  TEXT,                         -- denormalized; NULL when email was not required
  note          TEXT,                         -- optional message from client to photographer
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One submission per viewer per gallery.
  -- Revisions upsert this record; there is no version history in v1.1.0.
  UNIQUE (gallery_id, viewer_id)
);

CREATE INDEX idx_gallery_selections_gallery   ON gallery_selections (gallery_id);
CREATE INDEX idx_gallery_selections_submitted ON gallery_selections (gallery_id, submitted_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS for gallery_selections
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gallery_selections ENABLE ROW LEVEL SECURITY;

-- Unauthenticated clients can insert their own selection
CREATE POLICY "Viewers can submit selections"
  ON gallery_selections
  FOR INSERT
  WITH CHECK (true);

-- Unauthenticated clients can update their own selection (revision flow)
CREATE POLICY "Viewers can revise their own selection"
  ON gallery_selections
  FOR UPDATE
  USING (true);

-- Photographers can read selections only for galleries they own
CREATE POLICY "Photographers can read selections for their galleries"
  ON gallery_selections
  FOR SELECT
  USING (
    gallery_id IN (
      SELECT id FROM galleries WHERE photographer_id = auth.uid()
    )
  );
