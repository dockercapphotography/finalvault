-- Migration 057: all-sessions aggregate link, part 3 — the microsite toggle
--
-- Adds microsites.booking_show_all_sessions: a plain boolean, not a
-- sentinel value in booking_signup_page_id, because that column is a real
-- FK to signup_pages(id) (sql/051) and can't hold anything but a page id
-- or NULL. When true, the microsite's "Book a Shoot" button links to
-- /book/all/:token (the photographer's all_sessions_token, sql/055)
-- instead of a single signup page's /book/:token.
--
-- Also updates get_site_by_hostname to include the photographer's
-- all_sessions_token on the 'microsite' branch, since to_jsonb(v_microsite)
-- (sql/053) only carries columns that live on the microsites row itself --
-- this one lives on photographers, same reason booking_signup_page_token
-- and social_links are already merged in explicitly below. Byte-identical
-- to 053's version otherwise.
--
-- Run after: 056_get_signup_pages_by_token_rpc.sql

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS booking_show_all_sessions boolean NOT NULL DEFAULT false;

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
