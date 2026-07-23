-- Migration: 016_questionnaire_sends.sql
-- Feature: Track who a session questionnaire was sent to and when — v1.5.2
-- Run after: 015_client_management.sql
--
-- Deliberately a separate append-only table rather than columns on
-- session_questionnaires: setSessionQuestionnaires() does a full
-- delete+reinsert of that junction table whenever a session's
-- questionnaire list is edited, which would wipe any sent_at/sent_to
-- stored directly on it. This table also naturally supports "sent more
-- than once" -- the UI just reads the most recent row per questionnaire.

CREATE TABLE questionnaire_sends (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  questionnaire_id UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
  sent_to_email    TEXT NOT NULL,
  sent_to_name     TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questionnaire_sends_lookup
  ON questionnaire_sends (session_id, questionnaire_id, sent_at DESC);

ALTER TABLE questionnaire_sends ENABLE ROW LEVEL SECURITY;

-- Rows are only ever written by the send-questionnaire-email Edge Function,
-- using the service role key (which bypasses RLS) -- so photographers only
-- need read access here, scoped through the session they own.
CREATE POLICY "Photographers view sends for their own sessions"
  ON questionnaire_sends FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = questionnaire_sends.session_id
      AND s.photographer_id = auth.uid()
    )
  );
