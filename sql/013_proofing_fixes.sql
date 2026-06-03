-- Migration: 013_proofing_fixes.sql
-- Fixes found during smoke testing of Client Proofing feature

-- 1. Add selection_submitted to gallery_activity_log action check constraint
ALTER TABLE gallery_activity_log 
DROP CONSTRAINT gallery_activity_log_action_check;

ALTER TABLE gallery_activity_log 
ADD CONSTRAINT gallery_activity_log_action_check 
CHECK (action IN ('view', 'favorite', 'unfavorite', 'comment', 'download_single', 'download_all', 'selection_submitted'));

-- 2. Fix gallery_selections RLS — replace separate INSERT/UPDATE policies
--    with a single ALL policy matching the pattern used by gallery_favorites
DROP POLICY IF EXISTS "Viewers can submit selections" ON gallery_selections;
DROP POLICY IF EXISTS "Viewers can revise their own selection" ON gallery_selections;

CREATE POLICY "Anon can manage selections"
  ON gallery_selections
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Grant required permissions to anon role
GRANT INSERT, UPDATE, SELECT ON gallery_selections TO anon;
GRANT SELECT ON gallery_viewers TO anon;
GRANT USAGE ON SCHEMA public TO anon;
