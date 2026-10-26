-- Migration: 103_gallery_content_rpcs.sql
-- Security fix, gallery photos part 1 of 2 (Oct 25, 2026 audit). Safe to
-- run on its own: it only ADDS functions (and adds one field to
-- get_gallery_by_share_token's output); nothing is closed until 104.
--
-- The problem: gallery_images ("Anon can view gallery images": USING true),
-- gallery_sets and watermarks were readable with the public key for EVERY
-- gallery -- inactive, expired and password-protected included -- which
-- handed out every photo's file name and storage key. And a gallery's
-- password was only ever checked in the browser: the photo list itself was
-- served to anyone, so the password gate (and ?preview=1, which skipped it)
-- protected nothing.
--
-- After this change client galleries load their photos and sets through
-- get_client_gallery_content, which requires the share token, an open
-- gallery, and -- when the gallery has a password -- the correct password.
-- Photographers previewing their own gallery read through their existing
-- "Photographers can manage own ..." policies with their normal login.

-- 1. Gate page cover: add the cover photo's preview key to the existing
--    token lookup, so the gate no longer reads gallery_images directly.
--    Same columns and rules as 097, plus cover_preview_r2_key. The cover was
--    already shown on the gate before the password, so nothing new is exposed.
CREATE OR REPLACE FUNCTION public.get_gallery_by_share_token(p_token text)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_json(g) FROM (
    SELECT ga.id, ga.title, ga.client_name, ga.event_name, ga.template, ga.is_active, ga.expires_at,
           ga.require_password, ga.allow_downloads, ga.allow_favorites, ga.allow_comments,
           ga.require_download_pin, ga.download_watermarked, ga.allow_hires_download, ga.share_token,
           ga.photographer_id, ga.cover_image_id, ga.cover_r2_key, ga.cover_focus_x, ga.cover_focus_y,
           ga.event_date, ga.show_guide, ga.theme_color, ga.grid_size, ga.grid_spacing, ga.allow_proofing,
           (SELECT ci.preview_r2_key FROM gallery_images ci
             WHERE ci.id = ga.cover_image_id AND ci.gallery_id = ga.id AND ci.deleted_at IS NULL) AS cover_preview_r2_key
    FROM galleries ga
    WHERE ga.share_token = p_token
      AND ga.is_active = true
      AND (ga.expires_at IS NULL OR ga.expires_at > now())
    LIMIT 1
  ) g
$$;

-- 2. A client gallery's photos and sets. Returns
--      { "images": [...], "sets": [...] }        -- access granted
--      { "password_required": true }             -- password missing/wrong
--      null                                      -- unknown, inactive or expired
--    images keep the exact shape getClientImages() used to select,
--    including the nested watermarks object.
CREATE OR REPLACE FUNCTION public.get_client_gallery_content(p_token text, p_password text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery galleries;
BEGIN
  SELECT * INTO v_gallery
  FROM galleries
  WHERE share_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_gallery.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_gallery.require_password
     AND (v_gallery.plain_password IS NULL OR p_password IS NULL OR p_password <> v_gallery.plain_password) THEN
    RETURN json_build_object('password_required', true);
  END IF;

  RETURN json_build_object(
    'images', COALESCE((
      SELECT json_agg(json_build_object(
               'id', i.id, 'preview_r2_key', i.preview_r2_key, 'original_r2_key', i.original_r2_key,
               'web_r2_key', i.web_r2_key, 'file_name', i.file_name, 'file_size', i.file_size,
               'width', i.width, 'height', i.height, 'sort_order', i.sort_order, 'set_id', i.set_id,
               'watermark_id', i.watermark_id, 'updated_at', i.updated_at,
               'watermarks', CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object(
                 'r2_key', w.r2_key, 'opacity', w.opacity, 'position', w.position, 'scale', w.scale) END
             ) ORDER BY i.sort_order ASC NULLS LAST, i.id)
      FROM gallery_images i
      LEFT JOIN watermarks w ON w.id = i.watermark_id
      WHERE i.gallery_id = v_gallery.id AND i.deleted_at IS NULL
    ), '[]'::json),
    'sets', COALESCE((
      SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order)
                      ORDER BY s.sort_order ASC, s.id)
      FROM gallery_sets s
      WHERE s.gallery_id = v_gallery.id
    ), '[]'::json)
  );
END;
$$;

-- 3. Public microsite "Gallery" section: the preview keys of the gallery a
--    microsite showcases -- only while some enabled microsite actually
--    names that gallery as its source (the same rule the image server
--    applies before serving those previews). Text comparison so it works
--    whatever type gallery_source_gallery_id is stored as.
CREATE OR REPLACE FUNCTION public.get_microsite_gallery_keys(p_gallery_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(i.preview_r2_key ORDER BY i.sort_order ASC NULLS LAST, i.id), '[]'::json)
  FROM gallery_images i
  WHERE i.gallery_id = p_gallery_id
    AND i.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM microsites m
      WHERE m.enabled = true
        AND m.gallery_source_type = 'gallery'
        AND m.gallery_source_gallery_id::text = p_gallery_id::text
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_client_gallery_content(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_microsite_gallery_keys(uuid) TO anon, authenticated;
