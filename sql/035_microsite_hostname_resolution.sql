-- 035_microsite_hostname_resolution.sql
-- Adds get_site_by_hostname(), the single public entry point for resolving
-- a custom domain's root ("/") to either an enabled microsite or an
-- auto-generated placeholder (basic business info) when no microsite is
-- configured yet.
--
-- Follows the same pattern as get_client_portal_data() (see
-- docs/CLIENT_PORTAL_SPEC.md "RLS / Grants"): no blanket anon policy on
-- the underlying tables, everything funneled through one SECURITY DEFINER
-- function with an explicit, allowlisted return shape. This is also why
-- migration 034's "microsites_public_read_enabled" policy is dropped below
-- — that policy is now redundant with (and a wider surface than) this RPC.
--
-- Run after: 034_microsites.sql

DROP POLICY IF EXISTS "microsites_public_read_enabled" ON microsites;

CREATE OR REPLACE FUNCTION get_site_by_hostname(p_hostname text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_photographer_id uuid;
  v_microsite microsites%ROWTYPE;
  v_photographer photographers%ROWTYPE;
BEGIN
  SELECT photographer_id INTO v_photographer_id
  FROM photographer_domains
  WHERE domain = lower(trim(p_hostname))
    AND status = 'active';

  -- Unknown/inactive domain — same shape whether it was never configured
  -- or was removed, so this RPC can't be used to enumerate which domains
  -- exist on FinalVault.
  IF v_photographer_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  SELECT * INTO v_microsite
  FROM microsites
  WHERE photographer_id = v_photographer_id
    AND enabled = true;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'type', 'microsite',
      'studio_name', v_microsite.studio_name,
      'tagline', v_microsite.tagline,
      'bio', v_microsite.bio,
      'hero_image_key', v_microsite.hero_image_key,
      'contact_email', v_microsite.contact_email,
      'gallery_source_type', v_microsite.gallery_source_type,
      'gallery_source_gallery_id', v_microsite.gallery_source_gallery_id,
      'gallery_source_image_keys', v_microsite.gallery_source_image_keys,
      'show_pricing', v_microsite.show_pricing,
      'packages', v_microsite.packages,
      'pricing_note', v_microsite.pricing_note,
      'testimonials', v_microsite.testimonials,
      'accent_color', v_microsite.accent_color,
      'font_pairing', v_microsite.font_pairing,
      'radius', v_microsite.radius,
      'section_variants', v_microsite.section_variants
    );
  END IF;

  -- No microsite enabled — auto-generated placeholder from existing
  -- business-info fields (Account → Profile), no microsites row needed.
  SELECT * INTO v_photographer
  FROM photographers
  WHERE id = v_photographer_id;

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
$$;

GRANT EXECUTE ON FUNCTION get_site_by_hostname(text) TO anon;
