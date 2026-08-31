-- 044_microsite_section_headers.sql
-- Adds two things:
--   1. A standardized section header (Title + Subheading) for About,
--      Gallery, Pricing, Testimonials, and Contact -- rendered as a
--      centered Title / divider / Subheading block above each section's
--      content. Distinct from about_heading (the existing "Hi, I'm
--      Nick" personal greeting inside the About content itself) -- both
--      coexist, matching the reference site's own pattern of a section
--      title plus a separate personal heading further down.
--   2. hero_heading / hero_subheading -- fully freeform Hero text,
--      defaulting to studio_name/tagline for existing sites so nothing
--      changes visually until explicitly edited.
--
-- Run after: 043_microsite_theme.sql

ALTER TABLE microsites
  ADD COLUMN IF NOT EXISTS about_title text NOT NULL DEFAULT 'About',
  ADD COLUMN IF NOT EXISTS about_subheading text NOT NULL DEFAULT 'The Story Behind The Lens',
  ADD COLUMN IF NOT EXISTS gallery_title text NOT NULL DEFAULT 'Gallery',
  ADD COLUMN IF NOT EXISTS gallery_subheading text NOT NULL DEFAULT 'A Glimpse Of My Best Work',
  ADD COLUMN IF NOT EXISTS pricing_title text NOT NULL DEFAULT 'Pricing',
  ADD COLUMN IF NOT EXISTS pricing_subheading text NOT NULL DEFAULT 'Sessions & Packages',
  ADD COLUMN IF NOT EXISTS testimonials_title text NOT NULL DEFAULT 'Reviews',
  ADD COLUMN IF NOT EXISTS testimonials_subheading text NOT NULL DEFAULT 'What Clients Are Saying',
  ADD COLUMN IF NOT EXISTS contact_title text NOT NULL DEFAULT 'Contact',
  ADD COLUMN IF NOT EXISTS contact_subheading text NOT NULL DEFAULT 'Let''s Create Something Beautiful Together',
  ADD COLUMN IF NOT EXISTS hero_heading text,
  ADD COLUMN IF NOT EXISTS hero_subheading text;

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
      'contact_email', v_microsite.contact_email,
      'contact_phone', v_microsite.contact_phone,
      'contact_address', v_microsite.contact_address,
      'contact_hours', v_microsite.contact_hours,
      'social_links', v_photographer.social_links,
      'gallery_source_type', v_microsite.gallery_source_type,
      'gallery_source_gallery_id', v_microsite.gallery_source_gallery_id,
      'gallery_source_image_keys', v_microsite.gallery_source_image_keys,
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
