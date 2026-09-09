-- 0XX_submit_form_branding_and_cover.sql
--
-- Rename this file to the next available sql/0NN_ number before running --
-- placeholder left as 0XX since the exact current sequence wasn't
-- confirmed before writing this.
--
-- Two things:
--
-- 1. cover_image_r2_key / cover_focus_x / cover_focus_y on
--    questionnaire_templates -- same shape as sql/061's signup_pages
--    columns, but scoped to the questionnaire template itself (Nick's
--    call: a template gets reused across many sessions, so the cover
--    belongs to the template, not any one session).
--
-- 2. get_submit_form_data(p_token, p_questionnaire_id) -- a new
--    SECURITY DEFINER RPC replacing SubmitForm.jsx's getSessionByToken,
--    which was a plain client-side query with no way to safely add
--    branding data. microsites has no anon-read policy (deliberately
--    dropped in sql/035, see that migration's own comment) -- the only
--    sanctioned way to expose microsite branding to an anonymous public
--    page is a narrow SECURITY DEFINER function with an explicit,
--    allowlisted return shape, same pattern as get_site_by_hostname and
--    get_signup_page_data. This function follows that exactly.
--
--    Confirmed via live testing (incognito window against the real
--    production form) that the EXISTING plain query already works for
--    real anonymous visitors today -- sessions/questionnaire_templates
--    evidently already permit some form of anon read despite
--    SESSIONS_SPEC_v1.3.0.md's original "no public read" design note
--    (stale doc, not a live gap). This migration doesn't fix a security
--    hole in the existing session/questionnaire lookup -- it replaces
--    that lookup with an RPC so the NEW branding data can be added
--    without ever touching microsites RLS.
--
-- Run this whole file in the Supabase SQL editor.

ALTER TABLE questionnaire_templates
  ADD COLUMN IF NOT EXISTS cover_image_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS cover_focus_x NUMERIC DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS cover_focus_y NUMERIC DEFAULT 0.5;

CREATE OR REPLACE FUNCTION get_submit_form_data(p_token text, p_questionnaire_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session sessions%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE submit_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  SELECT jsonb_build_object(
    'type', 'found',
    'id', v_session.id,
    'name', v_session.name,
    'description', v_session.description,
    'mode', v_session.mode,
    'submit_token', v_session.submit_token,
    'questionnaire_templates', (
      CASE WHEN p_questionnaire_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object(
          'id', qt.id,
          'name', qt.name,
          'header_text', qt.header_text,
          'require_agreement', qt.require_agreement,
          'agreement_label', qt.agreement_label,
          'confirmation_message', qt.confirmation_message,
          'collect_email', qt.collect_email,
          'collect_name', qt.collect_name,
          'redirect_url', qt.redirect_url,
          'redirect_label', qt.redirect_label,
          'redirect_auto', qt.redirect_auto,
          'redirect_delay_seconds', qt.redirect_delay_seconds,
          'cover_image_r2_key', qt.cover_image_r2_key,
          'cover_focus_x', qt.cover_focus_x,
          'cover_focus_y', qt.cover_focus_y,
          'questionnaire_questions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', qq.id,
              'type', qq.type,
              'label', qq.label,
              'options', qq.options,
              'required', qq.required,
              'sort_order', qq.sort_order
            ) ORDER BY qq.sort_order ASC)
            FROM questionnaire_questions qq
            WHERE qq.template_id = qt.id
          ), '[]'::jsonb)
        )
        FROM questionnaire_templates qt
        WHERE qt.id = p_questionnaire_id
      ) END
    ),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        jsonb_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, p.business_name, p.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, p.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
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
          'studio_name', COALESCE(p.business_name, p.display_name),
          'logo_r2_key', p.logo_r2_key
        )
      END
      FROM photographers p
      LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
      WHERE p.id = v_session.photographer_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_submit_form_data(text, uuid) TO anon;
