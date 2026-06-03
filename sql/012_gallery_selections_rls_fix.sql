-- Migration: 012_gallery_selections_rls_fix.sql
-- Fix RLS policies on gallery_selections to explicitly grant to anon role
-- Required for PostgREST to allow unauthenticated client submissions

-- Grant table permissions to anon role
GRANT INSERT, UPDATE, SELECT ON gallery_selections TO anon;
GRANT SELECT ON gallery_viewers TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- Recreate INSERT policy with explicit TO anon
DROP POLICY IF EXISTS "Viewers can submit selections" ON gallery_selections;
CREATE POLICY "Viewers can submit selections"
  ON gallery_selections
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Recreate UPDATE policy with explicit TO anon and WITH CHECK
DROP POLICY IF EXISTS "Viewers can revise their own selection" ON gallery_selections;
CREATE POLICY "Viewers can revise their own selection"
  ON gallery_selections
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
