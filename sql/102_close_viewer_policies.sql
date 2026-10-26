-- Migration: 102_close_viewer_policies.sql
-- Security fix, gallery viewers part 2 of 2 (Oct 25, 2026 audit).
--
-- ONLY RUN AFTER the frontend that uses sql/101's functions is deployed
-- (commit "Route client gallery viewer actions through server-side checks").
--
-- Drops every anon policy on the viewer tables. Client galleries now do all
-- of this through the SECURITY DEFINER functions in 101, which check the
-- caller's own viewer_id and that the gallery is open. Photographer
-- policies ("Photographers can read/delete ... for their galleries",
-- "Photographers can reply ...") are untouched.
--
-- Also closes the old get_or_create_gallery_viewer(gallery_id, ...) to
-- anon/authenticated: it took a listable gallery id and never checked the
-- gallery was active. The app now uses get_or_create_gallery_viewer_by_token.
-- service_role keeps it (tests / maintenance).
--
-- ROLLBACK (restores everything exactly as it was):
--   CREATE POLICY "Anon can create a viewer session for an active gallery" ON public.gallery_viewers FOR INSERT TO anon WITH CHECK (EXISTS (SELECT 1 FROM galleries g WHERE g.id = gallery_viewers.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())));
--   CREATE POLICY "Anon can read viewers within the same active gallery" ON public.gallery_viewers FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM galleries g WHERE g.id = gallery_viewers.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())));
--   CREATE POLICY "Anon can update their own viewer session" ON public.gallery_viewers FOR UPDATE TO anon USING (EXISTS (SELECT 1 FROM galleries g WHERE g.id = gallery_viewers.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now()))) WITH CHECK (EXISTS (SELECT 1 FROM galleries g WHERE g.id = gallery_viewers.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())));
--   CREATE POLICY "Viewers can manage their own gallery favorites" ON public.gallery_favorites FOR ALL TO anon USING (EXISTS (SELECT 1 FROM gallery_viewers v JOIN galleries g ON g.id = v.gallery_id WHERE v.id = gallery_favorites.viewer_id AND v.gallery_id = gallery_favorites.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now()))) WITH CHECK (EXISTS (SELECT 1 FROM gallery_viewers v JOIN galleries g ON g.id = v.gallery_id WHERE v.id = gallery_favorites.viewer_id AND v.gallery_id = gallery_favorites.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())));
--   CREATE POLICY "Viewers can manage their own gallery selections" ON public.gallery_selections FOR ALL TO anon, authenticated USING (EXISTS (SELECT 1 FROM gallery_viewers v JOIN galleries g ON g.id = v.gallery_id WHERE v.id = gallery_selections.viewer_id AND v.gallery_id = gallery_selections.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now()))) WITH CHECK (EXISTS (SELECT 1 FROM gallery_viewers v JOIN galleries g ON g.id = v.gallery_id WHERE v.id = gallery_selections.viewer_id AND v.gallery_id = gallery_selections.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())));
--   CREATE POLICY "Anon can insert comments" ON public.gallery_comments FOR INSERT TO anon WITH CHECK ((viewer_id IS NOT NULL) AND (photographer_id IS NULL));
--   CREATE POLICY "Anon can read own comments and photographer comments" ON public.gallery_comments FOR SELECT TO anon USING ((deleted_at IS NULL) AND ((photographer_id IS NOT NULL) OR (EXISTS (SELECT 1 FROM gallery_viewers v JOIN galleries g ON g.id = v.gallery_id WHERE v.id = gallery_comments.viewer_id AND v.gallery_id = gallery_comments.gallery_id AND g.is_active = true AND (g.expires_at IS NULL OR g.expires_at > now())))));
--   CREATE POLICY "Anon can insert activity log" ON public.gallery_activity_log FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "Anon can log activity" ON public.gallery_activity_log FOR INSERT TO anon WITH CHECK (true);
--   GRANT EXECUTE ON FUNCTION public.get_or_create_gallery_viewer(uuid, text, text) TO PUBLIC;

DROP POLICY IF EXISTS "Anon can create a viewer session for an active gallery" ON public.gallery_viewers;
DROP POLICY IF EXISTS "Anon can read viewers within the same active gallery" ON public.gallery_viewers;
DROP POLICY IF EXISTS "Anon can update their own viewer session" ON public.gallery_viewers;
DROP POLICY IF EXISTS "Viewers can manage their own gallery favorites" ON public.gallery_favorites;
DROP POLICY IF EXISTS "Viewers can manage their own gallery selections" ON public.gallery_selections;
DROP POLICY IF EXISTS "Anon can insert comments" ON public.gallery_comments;
DROP POLICY IF EXISTS "Anon can read own comments and photographer comments" ON public.gallery_comments;
DROP POLICY IF EXISTS "Anon can insert activity log" ON public.gallery_activity_log;
DROP POLICY IF EXISTS "Anon can log activity" ON public.gallery_activity_log;

REVOKE EXECUTE ON FUNCTION public.get_or_create_gallery_viewer(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_gallery_viewer(uuid, text, text) TO service_role;
