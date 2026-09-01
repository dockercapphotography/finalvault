-- 058_booking_page_branding.sql
--
-- Part 1 of the booking-page redesign (Phase 1, front-end pieces -- see
-- claude/dev-workflow.md and the v1.5.11 chat for the full plan). Neither
-- RPC gains a new column here -- everything below already exists on
-- signup_shoot_types / microsites / photographers, it just wasn't being
-- returned to the public booking pages yet.
--
-- 1. get_signup_page_data: adds `session_type` to each shoot_type (already
--    a column on signup_shoot_types, confirmed via information_schema --
--    just never selected here), and a top-level `branding` object so the
--    /book/:token page can show the photographer's actual name/logo/theme
--    instead of nothing at all.
-- 2. get_signup_pages_by_token: same `branding` object, for the /book/all/:token
--    chooser page, keeping both public booking pages on one visual system.
--
-- `branding.has_microsite` is the fallback gate the frontend keys off of:
-- true only when the photographer has an ENABLED microsite, in which case
-- branding carries that microsite's real theme/accent/font/radius (the
-- same fields get_site_by_hostname already exposes for the microsite
-- itself, sql/051) so the booking page matches their live site. false
-- means no enabled microsite -- branding carries just a name and possibly
-- a photographer-level logo, and the frontend renders FinalVault's own
-- default look (no theme/accent applied), never a guessed/invented style.
--
-- Run after: 057_microsite_booking_show_all_sessions.sql
-- Run this whole file in the Supabase SQL editor.

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
        'latest_open_slot', latest.start_time
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

GRANT EXECUTE ON FUNCTION get_signup_page_data(text) TO anon;
GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
