-- Migration: 085_microsite_pricing_groups.sql
-- Feature: v1.5.16 -- structured microsite pricing (categories, shared
-- inclusions, per-package booking links)
-- Run after: 084_zip_jobs_expire_cron.sql
--
-- 1. microsites.pricing_groups -- the photographer's pricing categories,
--    in display order:
--      [{ "id": "<uuid>", "name": "Weddings",
--         "description": "optional intro line",
--         "includes": ["2nd photographer", "Getting ready", ...] }]
--    Packages stay in microsites.packages; each package points at a
--    category via its own group_id (null = uncategorized, rendered first
--    with no heading -- exactly today's behavior). No schema change to
--    packages itself: its new per-package fields live inside the existing
--    jsonb array (price_label, price_note, includes, featured, group_id,
--    booking_signup_page_id, booking_all_sessions, booking_label).
--
--    No get_site_by_hostname change is needed for this column: since
--    sql/053 the microsite branch returns to_jsonb(v_microsite), so a new
--    column flows through to the public site automatically.
--
-- 2. get_site_by_hostname gains `package_booking_tokens`: a
--    { "<signup_page_id>": "<token>" } map for every signup page a package
--    links to that is still live -- owned by this photographer, not
--    inactive, not archived. A package whose page was deleted, deactivated,
--    or archived simply isn't in the map, and the renderer hides that
--    package's Book button instead of linking to a dead or closed page.
--
--    Written against the LIVE function definition (pulled 2026-09-28),
--    which differs from the last tracked migration (057): it includes the
--    photographer_has_premium_access() gate. That gate and everything else
--    is preserved byte-for-byte; the only additions are the
--    v_package_booking_tokens variable, its lookup, and one extra key in
--    the returned object. The hero's booking_signup_page_token lookup is
--    intentionally left unchanged.

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS pricing_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

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
  v_package_booking_tokens jsonb;
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

    -- Tokens for signup pages linked from individual packages. Only live
    -- pages owned by this photographer; the jsonb_typeof guard keeps a
    -- malformed packages value from erroring the whole public site.
    SELECT COALESCE(jsonb_object_agg(sp.id::text, sp.token), '{}'::jsonb)
      INTO v_package_booking_tokens
    FROM signup_pages sp
    WHERE sp.photographer_id = v_photographer_id
      AND sp.is_active IS NOT FALSE
      AND sp.archived_at IS NULL
      AND sp.id::text IN (
        SELECT pkg->>'booking_signup_page_id'
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_microsite.packages) = 'array'
               THEN v_microsite.packages ELSE '[]'::jsonb END
        ) AS pkg
        WHERE jsonb_typeof(pkg) = 'object'
          AND pkg->>'booking_signup_page_id' IS NOT NULL
      );

    RETURN to_jsonb(v_microsite) || jsonb_build_object(
      'type', 'microsite',
      'booking_signup_page_token', v_booking_token,
      'package_booking_tokens', v_package_booking_tokens,
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

GRANT EXECUTE ON FUNCTION get_site_by_hostname(text) TO anon;
