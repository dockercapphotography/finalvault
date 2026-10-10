-- 095_review_link_custom_domain.sql
-- v1.5.17 fix: the review request email linked to final-vault.app even
-- when the photographer has an active custom domain. Copy link already
-- used the custom domain (src/utils/publicBaseUrl.js), and so does every
-- Edge Function email (supabase/functions/_shared/getPublicBaseUrl.ts);
-- send_testimonial_request builds its email in SQL and had the default
-- domain hardcoded.
--
--   1. fv_public_base_url(photographer_id) -- SQL counterpart of
--      getPublicBaseUrl.ts: 'https://' || domain when the photographer's
--      photographer_domains row is 'active', else https://final-vault.app.
--      (One row per photographer: photographer_id is UNIQUE, per 024.)
--   2. send_testimonial_request -- the 091 version, unchanged except the
--      review link uses fv_public_base_url. Signature and grants unchanged.
--
-- Not changed: the photographer's own "New review" email keeps linking
-- to final-vault.app/sessions/... -- that's the dashboard, not a client
-- page, and the dashboard lives on final-vault.app.
--
-- Run after: 094_email_notification_preferences.sql

-- ── 1. Base URL helper ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fv_public_base_url(p_photographer_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT 'https://' || domain
     FROM photographer_domains
     WHERE photographer_id = p_photographer_id
       AND status = 'active'
     LIMIT 1),
    'https://final-vault.app'
  );
$function$;

REVOKE ALL ON FUNCTION public.fv_public_base_url(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. send_testimonial_request ──────────────────────────────────────

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
  -- The photographer's active custom domain, like every other client
  -- link (095); final-vault.app otherwise.
  v_review_url := public.fv_public_base_url(v_uid) || '/review/' || v_request.token;
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
