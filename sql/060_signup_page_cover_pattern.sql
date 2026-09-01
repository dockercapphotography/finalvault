-- 060_signup_page_cover_pattern.sql
--
-- Phase 2 of the booking-page redesign: lets a photographer choose which
-- illustrated cover pattern (see src/components/booking/BookingCover.jsx)
-- a given signup page's booking hero uses -- Mountains, Trees, or Moon &
-- Stars -- rather than every page defaulting to the same one. Picked per
-- session from Sessions.jsx (the signup page's own settings), stored on
-- the page itself since it's specific to that one booking page, not the
-- photographer's account or microsite.
--
-- New column: signup_pages.cover_pattern, defaulting to 'mountains' so
-- every existing page keeps exactly the look it already has -- nothing
-- changes for a page until someone picks something else.
--
-- get_signup_page_data (the /book/:token RPC) now returns cover_pattern
-- at the top level alongside title/description/etc. Not added to
-- get_signup_pages_by_token (the /book/all/:token chooser) -- that page
-- doesn't render the hero/cover for any of its listed sessions, so there's
-- nothing there that would use it yet.
--
-- Run after: 059_booking_logo_dark_variant.sql
-- Run this whole file in the Supabase SQL editor.

ALTER TABLE signup_pages
  ADD COLUMN IF NOT EXISTS cover_pattern text NOT NULL DEFAULT 'mountains';

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
