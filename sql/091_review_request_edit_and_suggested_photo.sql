-- 091_review_request_edit_and_suggested_photo.sql
-- v1.5.17: editing / cancelling review requests, a suggested photo, and
-- private-sessions-only enforced in the database.
--
--   1. testimonial_requests.suggested_photo_key -- optional photo the
--      photographer suggests; pre-selected on the review page, the client
--      can switch or choose none.
--   2. send_testimonial_request gains p_suggested_photo_key (validated
--      against the session's linked galleries) and now refuses
--      non-private sessions. Signature changes, so the old 5-argument
--      version is dropped first and grants are re-applied.
--      p_send_email = false is the "Save" path (and Copy link).
--   3. cancel_testimonial_request(request_id) -- deletes a request so its
--      link stops working, but only before the client has submitted.
--      The direct DELETE policy is dropped: deleting a request cascades
--      to its submission, so a raw delete after submission would erase
--      the client's review history. All deletes go through this RPC.
--   4. get_review_form_data returns suggested_image_id. Otherwise the
--      same as 089.
--
-- Run after: 090_default_review_request_templates.sql

-- ── 1. Column ────────────────────────────────────────────────────────

ALTER TABLE testimonial_requests ADD COLUMN IF NOT EXISTS suggested_photo_key text;

-- ── 2. send_testimonial_request ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.send_testimonial_request(uuid, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.send_testimonial_request(
  p_session_id uuid,
  p_display_name text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_send_email boolean DEFAULT true,
  p_suggested_photo_key text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_session sessions%ROWTYPE;
  v_client clients%ROWTYPE;
  v_request testimonial_requests%ROWTYPE;
  v_photographer photographers%ROWTYPE;
  v_microsite_accent text;
  v_resend_key text;
  v_sender_name text;
  v_logo_url text;
  v_icon_row text;
  v_review_url text;
  v_button_color text;
  v_subject text;
  v_html text;
  v_session_line text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_session FROM sessions WHERE id = p_session_id AND photographer_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Reviews are for private sessions with one client; event / walk-up
  -- sessions don't get them (the Session Detail card is hidden there too).
  IF v_session.mode IS DISTINCT FROM 'private' THEN
    RAISE EXCEPTION 'Reviews can only be requested for private sessions.';
  END IF;

  IF NOT photographer_has_premium_access(v_uid) THEN
    RAISE EXCEPTION 'Your current plan does not include reviews.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_session.client_id IS NULL THEN
    RAISE EXCEPTION 'Link a client to this session before requesting a review.';
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_session.client_id;

  -- The suggested photo must be a live preview from one of this
  -- session's linked galleries -- the same set the review page offers.
  IF p_suggested_photo_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM gallery_images gi
    JOIN review_session_galleries(v_session.id) rg ON rg.gallery_id = gi.gallery_id
    WHERE gi.deleted_at IS NULL AND gi.preview_r2_key = p_suggested_photo_key
  ) THEN
    RAISE EXCEPTION 'That photo isn''t in this session''s galleries.';
  END IF;

  -- Every call carries the full editable state (name + suggested photo),
  -- so the suggested photo is always overwritten -- NULL clears it.
  INSERT INTO testimonial_requests (photographer_id, session_id, client_id, display_name, suggested_photo_key)
  VALUES (v_uid, v_session.id, v_session.client_id, NULLIF(trim(p_display_name), ''), p_suggested_photo_key)
  ON CONFLICT (session_id) DO UPDATE
    SET client_id = EXCLUDED.client_id,
        display_name = COALESCE(EXCLUDED.display_name, testimonial_requests.display_name),
        suggested_photo_key = EXCLUDED.suggested_photo_key
  RETURNING * INTO v_request;

  IF NOT p_send_email THEN
    RETURN jsonb_build_object('request_id', v_request.id, 'token', v_request.token, 'email_sent', false);
  END IF;

  -- Never re-ask someone who already answered.
  IF EXISTS (SELECT 1 FROM testimonial_submissions WHERE request_id = v_request.id) THEN
    RETURN jsonb_build_object('request_id', v_request.id, 'token', v_request.token, 'email_sent', false, 'reason', 'already_submitted');
  END IF;

  IF v_client.email IS NULL OR trim(v_client.email) = '' THEN
    RAISE EXCEPTION 'This client has no email address. Use Copy link instead.';
  END IF;

  IF p_subject IS NULL OR trim(p_subject) = '' THEN
    RAISE EXCEPTION 'Subject is required.';
  END IF;

  SELECT * INTO v_photographer FROM photographers WHERE id = v_uid;
  SELECT accent_color INTO v_microsite_accent FROM microsites WHERE photographer_id = v_uid AND enabled = true;

  SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
  IF v_resend_key IS NULL THEN
    RAISE EXCEPTION 'Email is not configured.';
  END IF;

  v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'Your Photographer');
  v_logo_url := CASE WHEN v_photographer.logo_r2_key IS NOT NULL
    THEN 'https://finalvault-worker.sitranephotography.workers.dev/logo/' || v_photographer.logo_r2_key
    ELSE NULL END;
  v_icon_row := build_email_icon_row(v_photographer.social_links, v_photographer.payment_links);
  v_review_url := 'https://final-vault.app/review/' || v_request.token;
  v_button_color := COALESCE(NULLIF(v_microsite_accent, ''), '#111111');
  v_subject := trim(p_subject);
  v_session_line := public.fv_escape_html(v_session.name) ||
    CASE WHEN v_session.session_date IS NOT NULL
      THEN ' · ' || to_char(v_session.session_date, 'FMMonth FMDD, YYYY') ELSE '' END;

  v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
    '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
    '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
    CASE WHEN v_logo_url IS NOT NULL
      THEN '<img src="' || v_logo_url || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
      ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
    END ||
    '</td></tr>' ||
    '<tr><td style="padding:28px 32px;">' ||
    '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">' || public.fv_simple_markdown_html(p_body) || '</p>' ||
    '<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:4px 0 12px;">' ||
    '<a href="' || v_review_url || '" style="display:inline-block;background:' || v_button_color || ';color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">Write a review</a>' ||
    '</td></tr></table>' ||
    '<p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">' || v_session_line || '</p>' ||
    '</td></tr>' ||
    '<tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">' ||
    v_icon_row ||
    '<p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
    '</td></tr></table></td></tr></table></body></html>';

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', v_sender_name || ' <noreply@mail.final-vault.app>',
      'to', jsonb_build_array(v_client.email),
      'subject', v_subject,
      'html', v_html
    )
  );

  UPDATE testimonial_requests
     SET last_sent_at = now(), last_sent_to = v_client.email, send_count = send_count + 1
   WHERE id = v_request.id;

  RETURN jsonb_build_object('request_id', v_request.id, 'token', v_request.token, 'email_sent', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.send_testimonial_request(uuid, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_testimonial_request(uuid, text, text, text, boolean, text) TO authenticated;

-- ── 3. cancel_testimonial_request ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_testimonial_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM testimonial_requests WHERE id = p_request_id AND photographer_id = auth.uid()) THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF EXISTS (SELECT 1 FROM testimonial_submissions WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'The client already sent this review, so the request can''t be cancelled.';
  END IF;

  DELETE FROM testimonial_requests WHERE id = p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_testimonial_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_testimonial_request(uuid) TO authenticated;

DROP POLICY IF EXISTS "Photographers delete own testimonial requests" ON testimonial_requests;

-- ── 4. get_review_form_data ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_review_form_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request testimonial_requests%ROWTYPE;
  v_session sessions%ROWTYPE;
  v_client clients%ROWTYPE;
  v_submission testimonial_submissions%ROWTYPE;
  v_gallery galleries%ROWTYPE;
  v_branding jsonb;
  v_images jsonb := '[]'::jsonb;
  v_default_name text;
  v_suggested_image_id uuid;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  SELECT * INTO v_request FROM testimonial_requests WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  IF NOT photographer_has_premium_access(v_request.photographer_id) THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  SELECT * INTO v_session FROM sessions WHERE id = v_request.session_id;
  SELECT * INTO v_client FROM clients WHERE id = v_request.client_id;

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
  END INTO v_branding
  FROM photographers p
  LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
  WHERE p.id = v_request.photographer_id;

  -- Cover: the first of the session's galleries (session_galleries
  -- order) that has one.
  SELECT g.* INTO v_gallery
  FROM review_session_galleries(v_session.id) rg
  JOIN galleries g ON g.id = rg.gallery_id
  ORDER BY (g.cover_r2_key IS NULL), rg.ord
  LIMIT 1;

  SELECT * INTO v_submission FROM testimonial_submissions WHERE request_id = v_request.id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'type', 'submitted',
      'quote', v_submission.quote,
      'name', v_submission.name,
      'submitted_at', v_submission.submitted_at,
      'client_first_name', v_client.first_name,
      'session_type', v_session.type,
      'cover_r2_key', v_gallery.cover_r2_key,
      'cover_focus_x', v_gallery.cover_focus_x,
      'cover_focus_y', v_gallery.cover_focus_y,
      -- Only while the image is still live in an active gallery -- the
      -- worker's review_token mode would 403 it otherwise.
      'photo_r2_key', CASE WHEN EXISTS (
          SELECT 1 FROM gallery_images gi
          JOIN review_session_galleries(v_session.id) rg ON rg.gallery_id = gi.gallery_id
          WHERE gi.deleted_at IS NULL
            AND gi.preview_r2_key = v_submission.photo_r2_key
        ) THEN v_submission.photo_r2_key END,
      'branding', v_branding
    );
  END IF;

  -- Photos from every linked gallery, in gallery order, then each
  -- gallery's own image order.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', gi.id, 'preview_r2_key', gi.preview_r2_key)
                            ORDER BY rg.ord, gi.sort_order NULLS LAST, gi.uploaded_at), '[]'::jsonb)
    INTO v_images
  FROM review_session_galleries(v_session.id) rg
  JOIN gallery_images gi ON gi.gallery_id = rg.gallery_id
  WHERE gi.deleted_at IS NULL
    AND gi.preview_r2_key IS NOT NULL;

  v_default_name := COALESCE(
    v_request.display_name,
    NULLIF(trim(COALESCE(v_client.first_name, '') ||
      CASE WHEN COALESCE(v_client.last_name, '') <> '' THEN ' ' || left(v_client.last_name, 1) || '.' ELSE '' END), '')
  );

  -- The photographer's suggested photo, if it's still a live image in
  -- one of the session's galleries -- the page pre-selects it.
  IF v_request.suggested_photo_key IS NOT NULL THEN
    SELECT gi.id INTO v_suggested_image_id
    FROM gallery_images gi
    JOIN review_session_galleries(v_session.id) rg ON rg.gallery_id = gi.gallery_id
    WHERE gi.deleted_at IS NULL AND gi.preview_r2_key = v_request.suggested_photo_key
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'type', 'found',
    'suggested_image_id', v_suggested_image_id,
    'session_name', v_session.name,
    'session_type', v_session.type,
    'client_first_name', v_client.first_name,
    'default_name', v_default_name,
    'cover_r2_key', v_gallery.cover_r2_key,
    'cover_focus_x', v_gallery.cover_focus_x,
    'cover_focus_y', v_gallery.cover_focus_y,
    'images', v_images,
    'branding', v_branding
  );
END;
$function$;
