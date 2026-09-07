-- Migration: 078_notification_master_toggles.sql
-- Adds a master on/off switch to two of the three notification settings
-- sections (Push already effectively has one -- "Enable on this device"
-- -- just relocating it to the section header, no schema change needed
-- there).
--
--   1. bell_notification_preferences.enabled -- when false, nothing
--      should appear in the bell dropdown regardless of the 8 individual
--      type toggles. Enforced in NotificationBell.jsx (not yet built --
--      next piece of work).
--   2. notification_preferences.digest_enabled -- when false, the daily
--      Activity Digest email should never send, regardless of the 3
--      individual type toggles underneath it. Enforced in
--      send-activity-digest (Edge Function change, separate from this
--      migration).
--
-- Both default true: neither section is currently gated by anything,
-- so shipping this shouldn't silently turn anything off.
--
-- Run after: 077_batch_activity_push_notifications.sql

ALTER TABLE bell_notification_preferences ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;
