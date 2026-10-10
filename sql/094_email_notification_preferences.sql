-- 094_email_notification_preferences.sql
-- v1.5.17: "Email me when a client sends a review" setting.
--
--   1. email_notification_preferences -- one row per photographer, same
--      shape and RLS as bell/push_notification_preferences. Starts with
--      the one email FinalVault sends that's worth switching off; other
--      emails can get columns here later.
--   2. submit_testimonial -- the 093 version, unchanged except the
--      photographer's "New review" email is skipped when the preference
--      is off. No row = on.
--
-- Also lets the Playwright suite turn the email off for the test account
-- so review tests don't spend Resend quota.
--
-- Run after: 093_review_links_to_session.sql

-- ── 1. Preferences table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_notification_preferences (
  photographer_id uuid PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
  testimonial boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers manage own email notification preferences" ON email_notification_preferences;
CREATE POLICY "Photographers manage own email notification preferences"
  ON email_notification_preferences FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

-- ── 2. submit_testimonial ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_testimonial(
  p_token text,
  p_quote text,
  p_name text,
  p_gallery_image_id uuid DEFAULT NULL,
  p_consent boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request testimonial_requests%ROWTYPE;
  v_session sessions%ROWTYPE;
  v_client clients%ROWTYPE;
  v_photographer photographers%ROWTYPE;
  v_submission_id uuid;
  v_quote text := trim(COALESCE(p_quote, ''));
  v_name text := trim(COALESCE(p_name, ''));
  v_photo_key text;
  v_client_full_name text;
  v_push_enabled boolean;
  v_email_enabled boolean;
  v_push_secret text;
  v_resend_key text;
  v_photographer_auth_email text;
  v_notify_email text;
  v_html text;
  v_photo_url text;
  v_session_url text;
  v_row_style text := 'padding:10px 16px;border-bottom:1px solid #e5e7eb;';
  v_label_style text := 'width:70px;color:#9ca3af;font-size:12px;';
  v_value_style text := 'color:#111111;font-size:13px;';
BEGIN
  IF NOT COALESCE(p_consent, false) THEN
    RAISE EXCEPTION 'Please confirm the review can be shown on the website.';
  END IF;
  IF char_length(v_quote) = 0 OR char_length(v_quote) > 1000 THEN
    RAISE EXCEPTION 'Your review must be between 1 and 1000 characters.';
  END IF;
  IF char_length(v_name) = 0 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Please enter a name to show (up to 80 characters).';
  END IF;

  SELECT * INTO v_request FROM testimonial_requests WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR NOT photographer_has_premium_access(v_request.photographer_id) THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM testimonial_submissions WHERE request_id = v_request.id) THEN
    RETURN jsonb_build_object('type', 'already_submitted');
  END IF;

  SELECT * INTO v_session FROM sessions WHERE id = v_request.session_id;
  SELECT * INTO v_client FROM clients WHERE id = v_request.client_id;

  IF p_gallery_image_id IS NOT NULL THEN
    SELECT gi.preview_r2_key INTO v_photo_key
    FROM gallery_images gi
    JOIN review_session_galleries(v_session.id) rg ON rg.gallery_id = gi.gallery_id
    WHERE gi.id = p_gallery_image_id
      AND gi.deleted_at IS NULL;
    IF v_photo_key IS NULL THEN
      RAISE EXCEPTION 'That photo is no longer available. Please pick another.';
    END IF;
  END IF;

  INSERT INTO testimonial_submissions (
    request_id, photographer_id, quote, name, session_type,
    gallery_image_id, photo_r2_key, consented_at
  ) VALUES (
    v_request.id, v_request.photographer_id, v_quote, v_name, v_session.type,
    CASE WHEN v_photo_key IS NOT NULL THEN p_gallery_image_id END, v_photo_key, now()
  )
  RETURNING id INTO v_submission_id;

  v_client_full_name := COALESCE(NULLIF(trim(COALESCE(v_client.first_name, '') || ' ' || COALESCE(v_client.last_name, '')), ''), v_name);

  -- Bell. The bell's own preference filtering happens on display, same
  -- as every other notification type.
  BEGIN
    INSERT INTO notifications (photographer_id, type, title, body, url)
    VALUES (
      v_request.photographer_id,
      'testimonial_submitted',
      v_client_full_name || ' left a review',
      COALESCE(v_session.name, 'Review'),
      '/sessions/' || v_session.id || '#review'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to insert testimonial notification: %', SQLERRM;
  END;

  -- Preference-gated push. Skips quietly until the Vault secret exists.
  BEGIN
    SELECT testimonial INTO v_push_enabled
    FROM push_notification_preferences
    WHERE photographer_id = v_request.photographer_id;

    IF COALESCE(v_push_enabled, true) THEN
      SELECT decrypted_secret INTO v_push_secret
      FROM vault.decrypted_secrets
      WHERE name = 'testimonial_push_secret';

      IF v_push_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-testimonial-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Testimonial-Push-Secret', v_push_secret
          ),
          body := jsonb_build_object('submissionId', v_submission_id)
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send testimonial push: %', SQLERRM;
  END;

  -- Photographer email. Same shell as the inquiry notification (076) so
  -- photographer emails read as one family: header row, title, details
  -- table, full-width indigo button. Adds the client's chosen photo and
  -- the quote with an accent bar. The photo loads through the worker's
  -- review_token mode -- the same URL the client's own page uses.
  BEGIN
    SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
    SELECT * INTO v_photographer FROM photographers WHERE id = v_request.photographer_id;
    SELECT email INTO v_photographer_auth_email FROM auth.users WHERE id = v_request.photographer_id;
    v_notify_email := COALESCE(NULLIF(v_photographer.business_email, ''), v_photographer_auth_email);

    -- Email preference (094). No row = on, same as every other
    -- notification preference.
    SELECT testimonial INTO v_email_enabled
    FROM email_notification_preferences
    WHERE photographer_id = v_request.photographer_id;
    v_session_url := 'https://final-vault.app/sessions/' || v_session.id;
    v_photo_url := CASE WHEN v_photo_key IS NOT NULL
      THEN 'https://finalvault-worker.sitranephotography.workers.dev/preview/' ||
           replace(v_photo_key, '/', '%2F') || '?review_token=' || v_request.token
      ELSE NULL END;

    IF COALESCE(v_email_enabled, true) AND v_resend_key IS NOT NULL AND v_notify_email IS NOT NULL THEN
      v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        -- Header row
        '<tr><td style="padding:18px 32px;border-bottom:1px solid #e5e7eb;">' ||
        '<span style="color:#111111;font-size:13px;font-weight:600;">New review</span>' ||
        '<span style="float:right;color:#9ca3af;font-size:12px;">Waiting for approval</span>' ||
        '</td></tr>' ||
        -- Client's chosen photo, full width
        CASE WHEN v_photo_url IS NOT NULL THEN
          '<tr><td style="padding:0;line-height:0;">' ||
          '<img src="' || v_photo_url || '" alt="Photo chosen by ' || public.fv_escape_html(v_name) || '" width="480" ' ||
          'style="display:block;width:100%;max-width:480px;height:auto;border:0;" /></td></tr>'
        ELSE '' END ||
        '<tr><td style="padding:24px 32px;">' ||
        -- Title + session line
        '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">' ||
          public.fv_escape_html(v_client_full_name) || ' left a review</p>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_session.name) || '</p>' ||
        -- Quote with indigo accent bar
        '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;"><tr>' ||
        '<td style="width:3px;background:#6366f1;border-radius:3px;"></td>' ||
        '<td style="padding:4px 0 4px 16px;">' ||
        '<p style="margin:0;color:#111111;font-size:16px;line-height:1.65;font-family:Georgia,''Times New Roman'',serif;font-style:italic;">&ldquo;' ||
          replace(public.fv_escape_html(v_quote), E'\n', '<br>') || '&rdquo;</p>' ||
        '<p style="margin:10px 0 0;color:#6b7280;font-size:13px;">&mdash; ' || public.fv_escape_html(v_name) || '</p>' ||
        '</td></tr></table>' ||
        -- Details table, same shape as the inquiry email's
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
          '<tr><td style="' || v_row_style || v_label_style || '">Client</td><td style="' || v_row_style || v_value_style || '">' ||
            public.fv_escape_html(v_client_full_name) || '</td></tr>' ||
          '<tr><td style="' || v_row_style || v_label_style || '">Email</td><td style="' || v_row_style || v_value_style || '">' ||
            COALESCE(public.fv_escape_html(NULLIF(v_client.email, '')), '&mdash;') || '</td></tr>' ||
          '<tr><td style="' || v_row_style || v_label_style || '">Type</td><td style="' || v_row_style || v_value_style || '">' ||
            COALESCE(public.fv_escape_html(NULLIF(v_session.type, '')), '&mdash;') || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;' || v_label_style || '">Photo</td><td style="padding:10px 16px;' || v_value_style || '">' ||
            CASE WHEN v_photo_key IS NOT NULL THEN 'Chosen from their gallery' ELSE 'None' END || '</td></tr>' ||
        '</table>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:1.6;">This review isn''t on your website yet. You can edit the wording or photo before approving it.</p>' ||
        -- Primary button + secondary link
        '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#6366f1;border-radius:8px;text-align:center;">' ||
        '<a href="' || v_session_url || '#review" style="display:block;padding:12px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">Review &amp; approve in FinalVault</a>' ||
        '</td></tr></table>' ||
        '<p style="margin:14px 0 0;text-align:center;"><a href="https://final-vault.app/website#testimonials" style="color:#6366f1;font-size:13px;text-decoration:none;">Or review it in your Website editor</a></p>' ||
        '</td></tr>' ||
        -- Footer
        '<tr><td style="padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center;">' ||
        '<p style="margin:0;color:#9ca3af;font-size:11px;">Turn review notifications on or off in Account &rarr; Notifications.</p>' ||
        '</td></tr>' ||
        '</table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'FinalVault <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(v_notify_email),
          'subject', 'New review — ' || v_session.name || ' (' || v_client_full_name || ')',
          'html', v_html
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send testimonial notification email: %', SQLERRM;
  END;

  RETURN jsonb_build_object('type', 'submitted', 'submission_id', v_submission_id);
END;
$function$;
