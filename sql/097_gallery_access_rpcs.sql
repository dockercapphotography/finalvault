-- Migration: 097_gallery_access_rpcs.sql
-- Security fix, part 1 of 2 (Oct 24, 2026 audit). Safe to run on its own:
-- it only ADDS functions; nothing existing changes until 098.
--
-- The problem: anon could SELECT every column of every active gallery
-- (the "Public can view active galleries by share token" policy never
-- actually checks a token), including share_token, plain_password and
-- plain_download_pin. The client app also downloaded plain_password /
-- plain_download_pin to the browser and compared them there. So anyone
-- holding the public key could list every gallery's link, password and PIN.
--
-- These three functions replace the client app's direct reads:
--   get_gallery_by_share_token -- display-safe columns only (no password,
--     no PIN), and only for a gallery the caller already has the token for.
--   gallery_password_matches / gallery_download_pin_matches -- the
--     comparison happens here, so the secret never leaves the database.
-- All three keep the old visibility rule exactly: active and not expired.

CREATE OR REPLACE FUNCTION public.get_gallery_by_share_token(p_token text)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_json(g) FROM (
    SELECT id, title, client_name, event_name, template, is_active, expires_at,
           require_password, allow_downloads, allow_favorites, allow_comments,
           require_download_pin, download_watermarked, allow_hires_download, share_token,
           photographer_id, cover_image_id, cover_r2_key, cover_focus_x, cover_focus_y,
           event_date, show_guide, theme_color, grid_size, grid_spacing, allow_proofing
    FROM galleries
    WHERE share_token = p_token
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  ) g
$$;

CREATE OR REPLACE FUNCTION public.gallery_password_matches(p_gallery_id uuid, p_password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT plain_password IS NOT NULL AND plain_password = p_password
    FROM galleries
    WHERE id = p_gallery_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.gallery_download_pin_matches(p_gallery_id uuid, p_pin text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT plain_download_pin IS NOT NULL AND plain_download_pin = p_pin
    FROM galleries
    WHERE id = p_gallery_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.get_gallery_by_share_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gallery_password_matches(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gallery_download_pin_matches(uuid, text) TO anon, authenticated;
