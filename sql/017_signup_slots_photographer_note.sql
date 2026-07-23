-- Migration: 017_signup_slots_photographer_note.sql
-- Feature: Private per-slot note on the Live Status page — v1.5.2
-- Run after: 016_questionnaire_sends.sql
--
-- A photographer-only note field (e.g. "brought 2 friends, wants extra
-- prints"). Never shown to the client, never touched by the public
-- claim_signup_slot RPC or the public booking page -- purely additive,
-- so it doesn't affect any existing flow.

ALTER TABLE signup_slots
  ADD COLUMN IF NOT EXISTS photographer_note TEXT;
