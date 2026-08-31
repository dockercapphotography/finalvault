-- 039_microsite_focal_points.sql
-- Adds focal point coordinates (normalized 0-1, same convention as the
-- existing gallery/folder cover focal point: cover_focus_x/y) for the
-- Hero image and About photo -- the two single, hand-picked "starring"
-- images where a bad crop is most damaging across the site's various
-- aspect ratios.
--
-- Run after: 038_microsite_about_section.sql

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS hero_focus_x real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS hero_focus_y real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS about_focus_x real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS about_focus_y real NOT NULL DEFAULT 0.5;

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
    RETURN jsonb_build_object(
      'type', 'microsite',
      'studio_name', v_microsite.studio_name,
      'tagline', v_microsite.tagline,
      'bio', v_microsite.bio,
      'hero_image_key', v_microsite.hero_image_key,
      'hero_focus_x', v_microsite.hero_focus_x,
      'hero_focus_y', v_microsite.hero_focus_y,
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
      'section_variants', v_microsite.section_variants,
      'logo_r2_key', COALESCE(v_microsite.logo_r2_key, v_photographer.logo_r2_key),
      'about_heading', v_microsite.about_heading,
      'about_photo_key', v_microsite.about_photo_key,
      'about_focus_x', v_microsite.about_focus_x,
      'about_focus_y', v_microsite.about_focus_y,
      'about_stats', v_microsite.about_stats
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
$$;

GRANT EXECUTE ON FUNCTION get_site_by_hostname(text) TO anon;
