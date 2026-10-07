-- 086_client_reviews.sql
-- v1.5.17: client-submitted reviews.
--
-- A photographer requests a review from a session (invite link, one per
-- session). The client writes it on the public /review/:token page; it
-- lands in testimonial_submissions as 'pending'. The photographer edits
-- (optionally) and approves it from the Website editor, which copies it
-- to the TOP of microsites.testimonials -- so the renderer, the four
-- layout variants, reordering, photo tools and get_site_by_hostname all
-- keep working unchanged.
--
-- Why pending reviews are NOT stored on microsites: get_site_by_hostname
-- returns to_jsonb(v_microsite) -- every microsites column is public on
-- every custom domain. Anything unapproved must live in its own table.
--
-- Contents:
--   0. HTML helpers for the two emails (escape + minimal markdown)
--   1. review_request_templates  (Account -> Templates -> Review Requests)
--   2. testimonial_requests      (one per session, holds the token)
--   3. testimonial_submissions   (client's original text, always kept)
--   4. testimonial column on bell/push notification preferences
--   5. set_default_review_request_template(id)        -- authenticated
--   6. send_testimonial_request(...)                    -- authenticated
--   7. get_review_form_data(token)                      -- anon
--   8. submit_testimonial(...)                          -- anon
--   9. approve_testimonial_submission(...)              -- authenticated
--  10. reject_testimonial_submission(id)                -- authenticated
--  11. grants
--
-- Requires (set up separately, before push is tested in step 6):
--   * Vault secret `testimonial_push_secret`
--   * Edge Function `send-testimonial-push`, deployed with --no-verify-jwt
-- Until both exist, the push block simply skips (secret lookup is NULL).
--
-- Run after: 085_microsite_pricing_groups.sql

-- ── 0. HTML helpers ──────────────────────────────────────────────────
-- Everything a photographer or client types goes through fv_escape_html
-- before it is placed in an email. fv_simple_markdown_html supports the
-- same subset the template editor's toolbar produces in practice: **bold**,
-- *italic*, and line breaks.

CREATE OR REPLACE FUNCTION public.fv_escape_html(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT replace(replace(replace(replace(replace(COALESCE(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$;

CREATE OR REPLACE FUNCTION public.fv_simple_markdown_html(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT replace(
    regexp_replace(
      regexp_replace(public.fv_escape_html(p), '\*\*(.+?)\*\*', '<strong>\1</strong>', 'g'),
      '\*(.+?)\*', '<em>\1</em>', 'g'),
    E'\n', '<br>');
$function$;

-- ── 1. review_request_templates ──────────────────────────────────────
-- Same shape and RLS as contract_templates / email_templates, plus
-- is_default (at most one per photographer, enforced by a partial unique
-- index; switch it via set_default_review_request_template below).

CREATE TABLE IF NOT EXISTS review_request_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_request_templates_photographer
  ON review_request_templates (photographer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_request_templates_one_default
  ON review_request_templates (photographer_id) WHERE is_default;

ALTER TABLE review_request_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers manage own review request templates" ON review_request_templates;
CREATE POLICY "Photographers manage own review request templates"
  ON review_request_templates FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

-- ── 2. testimonial_requests ──────────────────────────────────────────
-- One per session (UNIQUE session_id). Resend reuses the same row and
-- token. Read/delete directly via RLS; created and sent only through
-- send_testimonial_request(), which checks session ownership + premium.
-- Deleting a session deletes its request (and, via cascade, its
-- submission). An already-approved review stays on the website -- the
-- published copy lives in microsites.testimonials.

CREATE TABLE IF NOT EXISTS testimonial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  display_name text,
  last_sent_at timestamptz,
  last_sent_to text,
  send_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonial_requests_photographer ON testimonial_requests (photographer_id);
CREATE INDEX IF NOT EXISTS idx_testimonial_requests_client ON testimonial_requests (client_id);

ALTER TABLE testimonial_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers view own testimonial requests" ON testimonial_requests;
CREATE POLICY "Photographers view own testimonial requests"
  ON testimonial_requests FOR SELECT
  USING (photographer_id = auth.uid());

DROP POLICY IF EXISTS "Photographers delete own testimonial requests" ON testimonial_requests;
CREATE POLICY "Photographers delete own testimonial requests"
  ON testimonial_requests FOR DELETE
  USING (photographer_id = auth.uid());

-- ── 3. testimonial_submissions ───────────────────────────────────────
-- quote / name / photo are the CLIENT'S ORIGINAL values and are never
-- overwritten -- photographer edits only go into the published copy, so
-- "Restore" and the Client Detail history always have the original.
-- One submission per request (UNIQUE request_id). Read via RLS; written
-- only by the RPCs below.

CREATE TABLE IF NOT EXISTS testimonial_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES testimonial_requests(id) ON DELETE CASCADE,
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  quote text NOT NULL CHECK (char_length(quote) BETWEEN 1 AND 1000),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  session_type text,
  gallery_image_id uuid REFERENCES gallery_images(id) ON DELETE SET NULL,
  photo_r2_key text,
  consented_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  published_testimonial_id uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonial_submissions_photographer_status
  ON testimonial_submissions (photographer_id, status);

ALTER TABLE testimonial_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers view own testimonial submissions" ON testimonial_submissions;
CREATE POLICY "Photographers view own testimonial submissions"
  ON testimonial_submissions FOR SELECT
  USING (photographer_id = auth.uid());

-- ── 4. Notification preferences ──────────────────────────────────────
-- Both default TRUE, matching inquiry: a new review is something the
-- photographer has to act on.

ALTER TABLE bell_notification_preferences ADD COLUMN IF NOT EXISTS testimonial boolean NOT NULL DEFAULT true;
ALTER TABLE push_notification_preferences ADD COLUMN IF NOT EXISTS testimonial boolean NOT NULL DEFAULT true;

-- ── 5. set_default_review_request_template ───────────────────────────
-- Two statements on purpose: clearing first means the partial unique
-- index never sees two defaults mid-update. p_template_id NULL = no
-- default.

CREATE OR REPLACE FUNCTION public.set_default_review_request_template(p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM review_request_templates WHERE id = p_template_id AND photographer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  UPDATE review_request_templates
     SET is_default = false
   WHERE photographer_id = auth.uid()
     AND is_default
     AND id IS DISTINCT FROM p_template_id;

  IF p_template_id IS NOT NULL THEN
    UPDATE review_request_templates
       SET is_default = true
     WHERE id = p_template_id;
  END IF;
END;
$function$;

-- ── 6. send_testimonial_request ──────────────────────────────────────
-- Creates the session's request if it doesn't exist yet (so "Copy link"
-- works with p_send_email = false), and optionally emails it.
-- p_subject / p_body arrive with template variables ALREADY filled in by
-- the request modal (what the photographer previews is what's sent);
-- they're escaped here before going into HTML. The "Write a review"
-- button is always appended -- templates can't leave the link out.

CREATE OR REPLACE FUNCTION public.send_testimonial_request(
  p_session_id uuid,
  p_display_name text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_send_email boolean DEFAULT true
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

  IF NOT photographer_has_premium_access(v_uid) THEN
    RAISE EXCEPTION 'Your current plan does not include reviews.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_session.client_id IS NULL THEN
    RAISE EXCEPTION 'Link a client to this session before requesting a review.';
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_session.client_id;

  INSERT INTO testimonial_requests (photographer_id, session_id, client_id, display_name)
  VALUES (v_uid, v_session.id, v_session.client_id, NULLIF(trim(p_display_name), ''))
  ON CONFLICT (session_id) DO UPDATE
    SET client_id = EXCLUDED.client_id,
        display_name = COALESCE(EXCLUDED.display_name, testimonial_requests.display_name)
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

-- ── 7. get_review_form_data (anon) ───────────────────────────────────
-- Everything /review/:token needs, in one call. Branding block is the
-- same shape get_submit_form_data returns, so useBookingBranding can
-- consume it unchanged. Returns:
--   { type: 'not_found' }  -- bad token, or photographer lost premium
--   { type: 'submitted', ... }  -- already answered (shows their quote)
--   { type: 'found', ... }
-- `images` is empty when the session has no (active) gallery -- the
-- page then skips the photo section entirely.

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

  SELECT * INTO v_submission FROM testimonial_submissions WHERE request_id = v_request.id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'type', 'submitted',
      'quote', v_submission.quote,
      'name', v_submission.name,
      'submitted_at', v_submission.submitted_at,
      'client_first_name', v_client.first_name,
      'session_type', v_session.type,
      'branding', v_branding
    );
  END IF;

  IF v_session.gallery_id IS NOT NULL THEN
    SELECT * INTO v_gallery FROM galleries WHERE id = v_session.gallery_id AND is_active = true;
    IF FOUND THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', gi.id, 'preview_r2_key', gi.preview_r2_key)
                                ORDER BY gi.sort_order NULLS LAST, gi.uploaded_at), '[]'::jsonb)
        INTO v_images
      FROM gallery_images gi
      WHERE gi.gallery_id = v_gallery.id
        AND gi.deleted_at IS NULL
        AND gi.preview_r2_key IS NOT NULL;
    END IF;
  END IF;

  v_default_name := COALESCE(
    v_request.display_name,
    NULLIF(trim(COALESCE(v_client.first_name, '') ||
      CASE WHEN COALESCE(v_client.last_name, '') <> '' THEN ' ' || left(v_client.last_name, 1) || '.' ELSE '' END), '')
  );

  RETURN jsonb_build_object(
    'type', 'found',
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

-- ── 8. submit_testimonial (anon) ─────────────────────────────────────
-- One-shot per token: the request row is locked FOR UPDATE and the
-- UNIQUE(request_id) constraint backs it up. The chosen photo must be a
-- live image in THIS session's gallery. Side effects (bell, push,
-- photographer email) each run in their own exception block, same as
-- submit_signup_inquiry -- a failed email never loses the review.

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
  v_push_secret text;
  v_resend_key text;
  v_photographer_auth_email text;
  v_notify_email text;
  v_sender_name text;
  v_html text;
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
    JOIN galleries g ON g.id = gi.gallery_id
    WHERE gi.id = p_gallery_image_id
      AND gi.gallery_id = v_session.gallery_id
      AND gi.deleted_at IS NULL
      AND g.is_active = true;
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
      '/website#testimonials'
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

  -- Photographer email.
  BEGIN
    SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
    SELECT * INTO v_photographer FROM photographers WHERE id = v_request.photographer_id;
    SELECT email INTO v_photographer_auth_email FROM auth.users WHERE id = v_request.photographer_id;
    v_notify_email := COALESCE(NULLIF(v_photographer.business_email, ''), v_photographer_auth_email);
    v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'FinalVault');

    IF v_resend_key IS NOT NULL AND v_notify_email IS NOT NULL THEN
      v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        '<tr><td style="padding:18px 32px;border-bottom:1px solid #e5e7eb;">' ||
        '<span style="color:#111111;font-size:13px;font-weight:600;">New review</span>' ||
        '<span style="float:right;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_session.name) || '</span>' ||
        '</td></tr>' ||
        '<tr><td style="padding:24px 32px;">' ||
        '<p style="margin:0 0 16px;color:#111111;font-size:18px;font-weight:700;">' || public.fv_escape_html(v_client_full_name) || ' left a review</p>' ||
        '<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:12px;">' ||
        '<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;font-style:italic;">&ldquo;' ||
          replace(public.fv_escape_html(v_quote), E'\n', '<br>') || '&rdquo;</p>' ||
        '<p style="margin:8px 0 0;color:#6b7280;font-size:13px;">&mdash; ' || public.fv_escape_html(v_name) || '</p>' ||
        '</div>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">It won''t appear on your website until you approve it.</p>' ||
        '<a href="https://final-vault.app/website#testimonials" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:10px;">Review it</a>' ||
        '</td></tr></table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'FinalVault <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(v_notify_email),
          'subject', 'New review from ' || v_client_full_name,
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

-- ── 9. approve_testimonial_submission ────────────────────────────────
-- Atomic: locks the submission and the microsites row, prepends the
-- published entry to microsites.testimonials, marks the submission
-- approved. The editor passes the final (possibly edited) values; the
-- submission row keeps the client's originals.
-- p_photo_key must be one of this photographer's own R2 keys (a gallery
-- preview key or an upload under logos/), same shape the existing
-- testimonial photo tools store in photo_gallery_image_key.

CREATE OR REPLACE FUNCTION public.approve_testimonial_submission(
  p_submission_id uuid,
  p_quote text,
  p_name text,
  p_session_type text DEFAULT NULL,
  p_photo_key text DEFAULT NULL,
  p_photo_focus_x double precision DEFAULT NULL,
  p_photo_focus_y double precision DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_submission testimonial_submissions%ROWTYPE;
  v_microsite_id uuid;
  v_current jsonb;
  v_quote text := trim(COALESCE(p_quote, ''));
  v_name text := trim(COALESCE(p_name, ''));
  v_photo_key text := NULLIF(trim(COALESCE(p_photo_key, '')), '');
  v_entry jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_submission FROM testimonial_submissions
   WHERE id = p_submission_id AND photographer_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  IF v_submission.status <> 'pending' THEN
    RAISE EXCEPTION 'This review has already been %.', v_submission.status;
  END IF;

  IF v_quote = '' OR v_name = '' THEN
    RAISE EXCEPTION 'A review needs both a quote and a name.';
  END IF;

  IF v_photo_key IS NOT NULL AND v_photo_key NOT LIKE 'photographers/' || v_uid::text || '/%' THEN
    RAISE EXCEPTION 'Invalid photo';
  END IF;

  SELECT id, testimonials INTO v_microsite_id, v_current
  FROM microsites WHERE photographer_id = v_uid
  FOR UPDATE;
  IF v_microsite_id IS NULL THEN
    RAISE EXCEPTION 'Set up your website before approving reviews.';
  END IF;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid(),
    'quote', v_quote,
    'name', v_name,
    'session_type', NULLIF(trim(COALESCE(p_session_type, '')), ''),
    'photo_gallery_image_key', v_photo_key,
    'photo_focus_x', CASE WHEN v_photo_key IS NOT NULL THEN COALESCE(p_photo_focus_x, 0.5) END,
    'photo_focus_y', CASE WHEN v_photo_key IS NOT NULL THEN COALESCE(p_photo_focus_y, 0.5) END,
    'submission_id', v_submission.id
  ));

  UPDATE microsites
     SET testimonials = jsonb_build_array(v_entry) ||
       CASE WHEN jsonb_typeof(v_current) = 'array' THEN v_current ELSE '[]'::jsonb END
   WHERE id = v_microsite_id;

  UPDATE testimonial_submissions
     SET status = 'approved',
         reviewed_at = now(),
         published_testimonial_id = (v_entry->>'id')::uuid
   WHERE id = v_submission.id;

  RETURN v_entry;
END;
$function$;

-- ── 10. reject_testimonial_submission ────────────────────────────────
-- Never touches microsites, so it's safe while the editor has unsaved
-- changes. The client is not notified.

CREATE OR REPLACE FUNCTION public.reject_testimonial_submission(p_submission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE testimonial_submissions
     SET status = 'rejected', reviewed_at = now()
   WHERE id = p_submission_id
     AND photographer_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found, or already handled.';
  END IF;
END;
$function$;

-- ── 11. Grants ───────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default; revoke it so the
-- photographer-only RPCs are not callable anonymously at all (they also
-- check auth.uid() internally).

REVOKE ALL ON FUNCTION public.set_default_review_request_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_testimonial_request(uuid, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_testimonial_submission(uuid, text, text, text, text, double precision, double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_testimonial_submission(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_default_review_request_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_testimonial_request(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_testimonial_submission(uuid, text, text, text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_testimonial_submission(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_review_form_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_testimonial(text, text, text, uuid, boolean) TO anon, authenticated;
