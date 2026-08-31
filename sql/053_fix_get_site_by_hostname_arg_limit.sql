-- Migration 053: fix get_site_by_hostname hitting PostgreSQL's hard
-- 100-argument limit on a single function call.
--
-- The function's 'microsite' branch built its return value with one
-- jsonb_build_object(...) call listing every field explicitly. Each
-- key/value pair counts as 2 arguments to that call -- this session's
-- additions (section headers, hero family, focal points, etc.) grew
-- the list to 57 pairs = 114 arguments, past PostgreSQL error code
-- 54023's hard ceiling. Confirmed live via the actual error:
--   {code: '54023', message: 'cannot pass more than 100 arguments to a function'}
--
-- Fix: to_jsonb(v_microsite) converts the entire row to JSON in one
-- call (not a variadic argument list, so no limit applies), then the
-- few computed/overridden fields (type, booking token, social_links
-- from the photographers table, logo_r2_key's coalesce fallback) are
-- merged on top via jsonb's || concatenation operator, whose
-- right-hand side wins on any overlapping key.
--
-- This also means any future microsites columns are picked up
-- automatically without ever needing to touch this function again --
-- the exact class of bug that caused this outage.
--
-- The 'placeholder' branch (9 pairs = 18 arguments) was never at risk
-- and is left unchanged.

CREATE OR REPLACE FUNCTION public.get_site_by_hostname(p_hostname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_photographer_id uuid;
  v_microsite microsites%ROWTYPE;
  v_photographer photographers%ROWTYPE;
  v_booking_token text;
BEGIN
  SELECT photographer_id INTO v_photographer_id
  FROM photographer_domains
  WHERE domain = lower(trim(p_hostname))
    AND status = 'active';

  IF v_photographer_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  SELECT * INTO v_photographer
  FROM photographers
  WHERE id = v_photographer_id;

  SELECT * INTO v_microsite
  FROM microsites
  WHERE photographer_id = v_photographer_id
    AND enabled = true;

  IF FOUND THEN
    IF v_microsite.booking_signup_page_id IS NOT NULL THEN
      SELECT token INTO v_booking_token
      FROM signup_pages
      WHERE id = v_microsite.booking_signup_page_id;
    END IF;

    RETURN to_jsonb(v_microsite) || jsonb_build_object(
      'type', 'microsite',
      'booking_signup_page_token', v_booking_token,
      'social_links', v_photographer.social_links,
      'logo_r2_key', COALESCE(v_microsite.logo_r2_key, v_photographer.logo_r2_key)
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'placeholder',
    'business_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
    'avatar_r2_key', v_photographer.avatar_r2_key,
    'logo_r2_key', v_photographer.logo_r2_key,
    'business_email', v_photographer.business_email,
    'business_phone', v_photographer.business_phone,
    'business_city', v_photographer.business_city,
    'business_state', v_photographer.business_state,
    'accent_color', v_photographer.accent_color
  );
END;
$function$
