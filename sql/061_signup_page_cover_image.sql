-- 061_signup_page_cover_image.sql
--
-- The real cover-photo upload feature (the original "Phase 2" of the
-- booking-page redesign, folded into this v1.5.11 release): lets a
-- photographer use an actual photo as a signup page's cover, instead of
-- the illustrated pattern added in 060. The photo is picked from an
-- existing gallery image via MicrositeImagePicker (the same component
-- microsites already use for their own hero image) -- nothing is freshly
-- uploaded here, only referenced, so this needs no new R2 Worker upload
-- endpoint. A focal point (same convention as
-- sql/039_microsite_focal_points.sql) lets the photographer choose what
-- stays in frame across the very different mobile (short wide strip) and
-- desktop (tall narrow rail) crop shapes -- set via MicrositeFocalPointModal,
-- also reused as-is.
--
-- New columns:
--   cover_image_r2_key  -- the chosen gallery image's preview R2 key, NULL
--                           until a photographer picks a photo. When set,
--                           BookingCover.jsx renders this photo INSTEAD OF
--                           the illustrated cover_pattern; the pattern
--                           remains the automatic fallback whenever this
--                           is NULL.
--   cover_focus_x/y      -- normalized 0-1 focal point, defaulting to dead
--                           center like every other focal-point column in
--                           the app.
--
-- Serving this image on the public /book/:token page needs a NEW public
-- (no-login) R2 Worker verification path, since the existing
-- /preview/:key auth modes are either photographer/client-only (JWT,
-- share token) or scoped to microsite state (?microsite=1) -- neither
-- recognizes a signup page's cover photo as legitimate. Added as a new
-- ?booking_cover=1 mode on the SAME /preview/:key route (mirroring
-- ?microsite=1 exactly), verified fresh on every request against
-- signup_pages.cover_image_r2_key + is_active. See
-- r2-worker/src/middleware/bookingCoverAccess.js and the matching change
-- to r2-worker/src/handlers/preview.js. That worker change ships and
-- deploys separately from this SQL file and the frontend patch -- see the
-- delivery notes for the exact `wrangler deploy` step.
--
-- get_signup_page_data (the /book/:token RPC) now returns
-- cover_image_r2_key, cover_focus_x, cover_focus_y at the top level,
-- alongside cover_pattern. Not added to get_signup_pages_by_token (the
-- /book/all/:token chooser) -- same reasoning as 060, that page doesn't
-- render the hero/cover for any of its listed sessions.
--
-- Run after: 060_signup_page_cover_pattern.sql
-- Run this whole file in the Supabase SQL editor.

ALTER TABLE signup_pages
  ADD COLUMN IF NOT EXISTS cover_image_r2_key text,
  ADD COLUMN IF NOT EXISTS cover_focus_x real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS cover_focus_y real NOT NULL DEFAULT 0.5;

CREATE OR REPLACE FUNCTION public.get_signup_page_data(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_page signup_pages;
  v_result json;
BEGIN
  SELECT * INTO v_page FROM signup_pages WHERE token = p_token;

  IF v_page IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT v_page.is_active THEN
    RETURN json_build_object('active', false, 'title', v_page.title);
  END IF;

  SELECT json_build_object(
    'active', true,
    'title', v_page.title,
    'venue_address', v_page.venue_address,
    'timezone', v_page.timezone,
    'description', v_page.booking_description,
    'cover_pattern', v_page.cover_pattern,
    'cover_image_r2_key', v_page.cover_image_r2_key,
    'cover_focus_x', v_page.cover_focus_x,
    'cover_focus_y', v_page.cover_focus_y,
    'shoot_types', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', st.id,
        'name', st.name,
        'duration_minutes', st.duration_minutes,
        'session_type', st.session_type,
        'description', st.description,
        'price', CASE WHEN v_page.show_pricing THEN st.price ELSE NULL END,
        'retainer_amount', CASE WHEN v_page.show_pricing THEN st.retainer_amount ELSE NULL END
      ) ORDER BY st.sort_order), '[]'::json)
      FROM signup_shoot_types st
      WHERE st.signup_page_id = v_page.id
    ),
    'open_slots', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'shoot_type_id', s.shoot_type_id,
        'start_time', s.start_time,
        'end_time', s.end_time
      ) ORDER BY s.start_time), '[]'::json)
      FROM signup_slots s
      WHERE s.signup_page_id = v_page.id
        AND s.claimed_at IS NULL
        AND s.start_time > now()
        AND NOT EXISTS (
          SELECT 1 FROM signup_slots claimed
          WHERE claimed.signup_page_id = s.signup_page_id
            AND claimed.claimed_at IS NOT NULL
            AND claimed.time_range && s.time_range
        )
    ),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        json_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, p.business_name, p.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, p.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
          'theme', m.theme,
          'accent_color', m.accent_color,
          'font_pairing', m.font_pairing,
          'custom_display_font', m.custom_display_font,
          'custom_body_font', m.custom_body_font,
          'radius', m.radius
        )
      ELSE
        json_build_object(
          'has_microsite', false,
          'studio_name', COALESCE(p.business_name, p.display_name),
          'logo_r2_key', p.logo_r2_key
        )
      END
      FROM photographers p
      LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
      WHERE p.id = v_page.photographer_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_signup_page_data(text) TO anon;
