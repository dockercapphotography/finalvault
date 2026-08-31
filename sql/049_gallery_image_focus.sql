-- 049_gallery_image_focus.sql
-- Adds gallery_image_focus -- per-image focal points for the Gallery
-- section, same jsonb-map-by-key pattern as the Hero Cycle/Mosaic
-- focus fields. Works for both gallery_source_type modes ('gallery'
-- and 'manual') since it's keyed by the image's own stable R2 key,
-- not by which mode selected it.
--
-- Run after: 048_hero_multi_image_focus.sql

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS gallery_image_focus jsonb NOT NULL DEFAULT '{}';

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
      'hero_heading', v_microsite.hero_heading,
      'hero_subheading', v_microsite.hero_subheading,
      'hero_cycle_image_keys', v_microsite.hero_cycle_image_keys,
      'hero_mosaic_image_keys', v_microsite.hero_mosaic_image_keys,
      'hero_cycle_image_focus', v_microsite.hero_cycle_image_focus,
      'hero_mosaic_image_focus', v_microsite.hero_mosaic_image_focus,
      'hero_show_primary_btn', v_microsite.hero_show_primary_btn,
      'hero_show_secondary_btn', v_microsite.hero_show_secondary_btn,
      'contact_email', v_microsite.contact_email,
      'contact_phone', v_microsite.contact_phone,
      'contact_address', v_microsite.contact_address,
      'contact_hours', v_microsite.contact_hours,
      'social_links', v_photographer.social_links,
      'gallery_source_type', v_microsite.gallery_source_type,
      'gallery_source_gallery_id', v_microsite.gallery_source_gallery_id,
      'gallery_source_image_keys', v_microsite.gallery_source_image_keys,
      'gallery_image_focus', v_microsite.gallery_image_focus,
      'show_pricing', v_microsite.show_pricing,
      'packages', v_microsite.packages,
      'pricing_note', v_microsite.pricing_note,
      'testimonials', v_microsite.testimonials,
      'accent_color', v_microsite.accent_color,
      'theme', v_microsite.theme,
      'font_pairing', v_microsite.font_pairing,
      'custom_display_font', v_microsite.custom_display_font,
      'custom_body_font', v_microsite.custom_body_font,
      'radius', v_microsite.radius,
      'section_variants', v_microsite.section_variants,
      'logo_r2_key', COALESCE(v_microsite.logo_r2_key, v_photographer.logo_r2_key),
      'logo_dark_r2_key', v_microsite.logo_dark_r2_key,
      'about_heading', v_microsite.about_heading,
      'about_photo_key', v_microsite.about_photo_key,
      'about_focus_x', v_microsite.about_focus_x,
      'about_focus_y', v_microsite.about_focus_y,
      'about_stats', v_microsite.about_stats,
      'about_title', v_microsite.about_title,
      'about_subheading', v_microsite.about_subheading,
      'gallery_title', v_microsite.gallery_title,
      'gallery_subheading', v_microsite.gallery_subheading,
      'pricing_title', v_microsite.pricing_title,
      'pricing_subheading', v_microsite.pricing_subheading,
      'testimonials_title', v_microsite.testimonials_title,
      'testimonials_subheading', v_microsite.testimonials_subheading,
      'contact_title', v_microsite.contact_title,
      'contact_subheading', v_microsite.contact_subheading
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
