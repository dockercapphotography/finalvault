-- Migration 056: all-sessions aggregate link, part 2 — the public RPC
--
-- Adds get_signup_pages_by_token(p_token), the anon-callable entry point
-- for the new public page at /book/all/:token. Given a photographer's
-- all_sessions_token (sql/055), returns that photographer's business name
-- plus every ACTIVE signup page, each with its earliest and latest open
-- (unclaimed, future) slot time so the chooser page can show dates per
-- Nick's requirement -- without a second round trip per page.
--
-- Modeled directly on get_signup_page_data's envelope shape
-- ({type: 'found' | 'not_found', ...}) and SECURITY DEFINER + anon GRANT
-- pattern (sql/052) -- same trust boundary as every other public booking
-- RPC: token in, public-safe fields out, nothing else on signup_pages or
-- photographers is exposed.
--
-- Run after: 055_photographers_all_sessions_token.sql

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

GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
