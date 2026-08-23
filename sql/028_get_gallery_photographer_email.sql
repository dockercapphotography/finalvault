-- Migration: 028_get_gallery_photographer_email.sql
-- Feature: Tier 3 async ZIP queue -- photographer preview mode has no
-- gallery_viewers record (no name-gate ever runs for the photographer
-- previewing their own gallery), so there's no viewer email to notify
-- when a hi-res download is queued async. This RPC lets the anon client
-- (which ClientGalleryView.jsx always uses, preview or not) safely
-- resolve the photographer's own account email in that specific case.
--
-- Scoped through gallery_id rather than a raw photographer_id lookup --
-- tighter than the existing get_photographer_display_name(p_photographer_id)
-- precedent (which takes an unscoped ID), since email is more sensitive
-- than a display name. Requires the caller to already know a specific
-- active gallery's id, not just any photographer's id.

CREATE OR REPLACE FUNCTION get_gallery_photographer_email(p_gallery_id UUID)
RETURNS TEXT AS $$
  SELECT au.email
  FROM galleries g
  JOIN auth.users au ON au.id = g.photographer_id
  WHERE g.id = p_gallery_id AND g.is_active = true
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_gallery_photographer_email(UUID) TO anon;
