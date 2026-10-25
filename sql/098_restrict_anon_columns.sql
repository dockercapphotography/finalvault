-- Migration: 098_restrict_anon_columns.sql
-- Security fix, part 2 of 2 (Oct 24, 2026 audit).
--
-- ONLY RUN AFTER the frontend that uses sql/097's functions is deployed
-- (commit "Read client galleries through server-side checks"). Before that,
-- the live client gallery still reads galleries directly and would break.
--
-- Row-level security decides WHICH rows anon sees; column privileges decide
-- WHICH COLUMNS. anon had every column of both tables. This keeps exactly
-- the columns anon still needs and removes the rest:
--
-- galleries: id, photographer_id, is_active, expires_at -- referenced by
--   policies that apply to anon: the viewer policies on gallery_viewers /
--   gallery_favorites / gallery_selections / gallery_comments use id,
--   is_active and expires_at; the "to public" photographer policies on
--   gallery_sets and gallery_selections also evaluate for anon and look up
--   galleries.photographer_id, so without it anon reads of sets and
--   selections fail with "permission denied". photographer_id is just the
--   account id (get_gallery_by_share_token returns it too). Everything else
--   (share_token, plain_password, plain_download_pin, password and PIN
--   hashes, client_name, notes, ...) is now unreadable to anon. The client
--   app reads galleries only through get_gallery_by_share_token.
--
-- photographers: id, display_name, business_name, logo_r2_key, avatar_r2_key
--   -- what the public gallery and client pages show. Business address,
--   phone, email, payment links, is_admin, all_sessions_token and the rest
--   are now unreadable to anon.
--
-- SECURITY DEFINER functions (booking pages, microsites, client portal,
-- get_site_by_hostname, ...) run as their owner and are unaffected. The R2
-- worker and Edge Functions use the service role and are unaffected.
--
-- ROLLBACK (restores the previous access exactly):
--   GRANT SELECT ON TABLE public.galleries TO anon;
--   GRANT SELECT ON TABLE public.photographers TO anon;

REVOKE SELECT ON TABLE public.galleries FROM anon;
GRANT SELECT (id, photographer_id, is_active, expires_at) ON TABLE public.galleries TO anon;

REVOKE SELECT ON TABLE public.photographers FROM anon;
GRANT SELECT (id, display_name, business_name, logo_r2_key, avatar_r2_key) ON TABLE public.photographers TO anon;
