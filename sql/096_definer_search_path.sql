-- Migration: 096_definer_search_path.sql
-- Security hardening (Oct 24, 2026 audit).
--
-- get_gallery_photographer_email is SECURITY DEFINER and callable by anon,
-- but was created without SET search_path. A SECURITY DEFINER function
-- should always pin its search_path, so name resolution inside it can't be
-- influenced by the caller's settings. It was the only function in public
-- missing it. Its body references public.galleries and auth.users, which
-- resolve the same with search_path = public, so behavior is unchanged.

ALTER FUNCTION public.get_gallery_photographer_email(uuid) SET search_path = public;
