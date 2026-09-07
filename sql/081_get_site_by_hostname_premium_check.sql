-- Migration: 081_get_site_by_hostname_premium_check.sql
-- The frontend redirect gate (useCustomDomainAccessGate) runs async on
-- every custom-domain page load and bounces away if entitlement is
-- lost -- but on the microsite root specifically, CustomDomainRoot.jsx
-- has its own separate fetch of this exact function, which would still
-- return full, real microsite content during the brief window before
-- the redirect hook's own check completes. This closes that gap by
-- checking entitlement here directly, so even that brief window shows
-- nothing rather than a flash of real content.
--
-- Returns the same 'not_found' shape used for an unrecognized/removed
-- domain -- consistent with that branch's existing intent (never
-- distinguish "never existed" from "no longer accessible").
--
-- Everything else about this function is untouched from its current
-- live definition.
--
-- Run after: 080_premium_feature_tier_gating.sql

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

  IF NOT photographer_has_premium_access(v_photographer_id) THEN
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
      'all_sessions_token', v_photographer.all_sessions_token,
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
$function$;
