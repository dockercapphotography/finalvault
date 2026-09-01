-- 063_all_sessions_branding_fallback_fix.sql
--
-- Bug fix, found while writing Playwright coverage for the booking-redesign
-- arc (v1.5.11 step 13): get_signup_pages_by_token's `branding` subquery
-- had a dead ELSE branch. It read:
--
--   SELECT CASE WHEN m.id IS NOT NULL THEN {...} ELSE {...} END
--   FROM microsites m
--   WHERE m.photographer_id = v_photographer.id AND m.enabled = true
--
-- With a plain FROM/WHERE (no join), a photographer with no enabled
-- microsite matches zero rows -- so the CASE never runs at all, and the
-- whole subquery returns SQL NULL rather than the ELSE branch's
-- `has_microsite: false` fallback object. The frontend's own
-- `data?.branding || { has_microsite: false, studio_name: null, ... }`
-- masks this well enough that nothing looked broken (the chooser still
-- shows the correct default indigo look), but it meant a photographer
-- without an enabled microsite NEVER got their own account name/logo
-- shown in the /book/all/:token header -- unlike the single-page
-- /book/:token RPC (get_signup_page_data), which already gets this right
-- via a LEFT JOIN against a guaranteed one-row `photographers` base:
--
--   FROM photographers p
--   LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
--   WHERE p.id = v_page.photographer_id
--
-- This migration brings get_signup_pages_by_token's branding subquery in
-- line with that same, already-correct pattern. Nothing else about this
-- RPC changes -- the cover_pattern/cover_image_r2_key/cover_focus_x/
-- cover_focus_y fields sql/062 added to each signup page stay exactly as
-- they were.
--
-- Run after: 062_all_sessions_cover_images.sql
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
      FROM photographers p
      LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
      WHERE p.id = v_photographer.id
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
