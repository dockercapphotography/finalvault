-- Migration: 104_close_gallery_content_policies.sql
-- Security fix, gallery photos part 2 of 2 (Oct 25, 2026 audit).
--
-- ONLY RUN AFTER the frontend that uses sql/103's functions is deployed
-- (commit "Load client gallery photos through a password-checked server
-- function").
--
-- Drops the four policies that let the public key read galleries,
-- gallery_images, gallery_sets and watermarks for every gallery. Client
-- galleries, the gate page and public microsites now go through 103's
-- functions; photographers keep their "Photographers can manage own ..."
-- policies; the r2-worker uses the service key and is unaffected.
--
-- Column grants: anon keeps SELECT on galleries.id and
-- galleries.photographer_id ONLY because four photographer policies that
-- apply "to public" (gallery_clients, gallery_selections,
-- gallery_tag_assignments, zip_jobs) read those columns while being
-- evaluated, and a missing grant there turns an empty result into
-- "permission denied" (the 098 lesson). With no anon policy left on
-- galleries those columns return no rows. is_active and expires_at were
-- only needed by the policies dropped here and in 102, so they go.
--
-- ROLLBACK (restores everything exactly as it was):
--   CREATE POLICY "Public can view active galleries by share token" ON public.galleries FOR SELECT TO anon USING ((is_active = true) AND ((expires_at IS NULL) OR (expires_at > now())));
--   CREATE POLICY "Anon can view gallery images" ON public.gallery_images FOR SELECT TO anon USING (true);
--   CREATE POLICY "Public can read sets for active galleries" ON public.gallery_sets FOR SELECT TO public USING (gallery_id IN (SELECT galleries.id FROM galleries WHERE (galleries.is_active = true)));
--   CREATE POLICY "Public can read watermarks" ON public.watermarks FOR SELECT TO anon USING (true);
--   GRANT SELECT (is_active, expires_at) ON public.galleries TO anon;

DROP POLICY IF EXISTS "Public can view active galleries by share token" ON public.galleries;
DROP POLICY IF EXISTS "Anon can view gallery images" ON public.gallery_images;
DROP POLICY IF EXISTS "Public can read sets for active galleries" ON public.gallery_sets;
DROP POLICY IF EXISTS "Public can read watermarks" ON public.watermarks;

REVOKE SELECT (is_active, expires_at) ON public.galleries FROM anon;
