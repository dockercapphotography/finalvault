-- 062_all_sessions_cover_images.sql
--
-- Feeds each signup page's cover (illustrated pattern or, once uploaded,
-- a real photo -- see sql/060_signup_page_cover_pattern.sql and
-- sql/061_signup_page_cover_image.sql) into get_signup_pages_by_token,
-- the /book/all/:token chooser page's RPC. Both prior migrations
-- deliberately skipped this RPC ("that page doesn't render the hero/cover
-- for any of its listed sessions") -- that's no longer true: the chooser
-- page's session cards now show each session's own cover as their main
-- visual, the same as its individual /book/:token page does, rather than
-- a plain generic camera icon.
--
-- Adds cover_pattern, cover_image_r2_key, cover_focus_x, cover_focus_y to
-- each entry in the signup_pages array. No new columns -- these already
-- exist on signup_pages; this migration only changes what the RPC
-- selects. `branding` (added in sql/058/059) is untouched.
--
-- Run after: 061_signup_page_cover_image.sql
-- Run this whole file in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION get_signup_pages_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_photographer photographers%ROWTYPE;
BEGIN
  SELECT * INTO v_photographer
  FROM photographers
  WHERE all_sessions_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'type', 'found',
    'business_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        jsonb_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, v_photographer.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
          'theme', m.theme,
          'accent_color', m.accent_color,
          'font_pairing', m.font_pairing,
          'custom_display_font', m.custom_display_font,
          'custom_body_font', m.custom_body_font,
          'radius', m.radius
        )
      ELSE
        jsonb_build_object(
          'has_microsite', false,
          'studio_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', v_photographer.logo_r2_key
        )
      END
      FROM microsites m
      WHERE m.photographer_id = v_photographer.id AND m.enabled = true
    ),
    'signup_pages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'token', sp.token,
        'title', sp.title,
        'venue_address', sp.venue_address,
        'timezone', sp.timezone,
        'earliest_open_slot', earliest.start_time,
        'latest_open_slot', latest.start_time,
        'cover_pattern', sp.cover_pattern,
        'cover_image_r2_key', sp.cover_image_r2_key,
        'cover_focus_x', sp.cover_focus_x,
        'cover_focus_y', sp.cover_focus_y
      ) ORDER BY earliest.start_time ASC NULLS LAST, sp.created_at ASC)
      FROM signup_pages sp
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time ASC LIMIT 1
      ) earliest ON true
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time DESC LIMIT 1
      ) latest ON true
      WHERE sp.photographer_id = v_photographer.id AND sp.is_active = true
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
