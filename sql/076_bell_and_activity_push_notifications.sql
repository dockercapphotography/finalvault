-- Migration: 076_bell_and_activity_push_notifications.sql
-- Two additions:
--
-- 1. bell_notification_preferences -- new table, separate from both
--    push_notification_preferences and the digest's notification_preferences
--    (three distinct concerns, three distinct tables, deliberately --
--    019/020's naming collision taught this the hard way once already).
--    All columns default TRUE: the bell shows every event type
--    unconditionally today, so shipping this shouldn't silently hide
--    anything until a photographer actively turns something off.
--
-- 2. push_notification_preferences gets a new `inquiry` column (default
--    TRUE, matching claim/contract_signed/questionnaire_response), and
--    submit_signup_inquiry gets a preference-gated push send, same
--    pattern as claim/questionnaire.
--
-- 3. A new trigger on gallery_activity_log sends push for
--    favorite/comment/download_single/download_all (never view/unfavorite,
--    matching exactly which actions the Activity Digest already treats as
--    notify-worthy). No `notifications` table insert here -- the bell
--    already shows these directly from gallery_activity_log, so inserting
--    into `notifications` too would create duplicate bell entries for the
--    same event.
--
-- Two new Edge Functions required (deployed separately, see deployment
-- notes at the end of this file): send-inquiry-push, send-activity-push.
--
-- Run after: 075_bell_notification_time_range.sql

-- ── 1. bell_notification_preferences ──────────────────────────────────

CREATE TABLE IF NOT EXISTS bell_notification_preferences (
  photographer_id uuid PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
  claim boolean NOT NULL DEFAULT true,
  contract_signed boolean NOT NULL DEFAULT true,
  questionnaire_response boolean NOT NULL DEFAULT true,
  inquiry boolean NOT NULL DEFAULT true,
  view boolean NOT NULL DEFAULT true,
  favorite boolean NOT NULL DEFAULT true,
  comment boolean NOT NULL DEFAULT true,
  download boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bell_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers can view their own bell preferences" ON bell_notification_preferences;
CREATE POLICY "Photographers can view their own bell preferences"
  ON bell_notification_preferences FOR SELECT
  USING (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "Photographers can create their own bell preferences" ON bell_notification_preferences;
CREATE POLICY "Photographers can create their own bell preferences"
  ON bell_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "Photographers can update their own bell preferences" ON bell_notification_preferences;
CREATE POLICY "Photographers can update their own bell preferences"
  ON bell_notification_preferences FOR UPDATE
  USING (auth.uid() = photographer_id)
  WITH CHECK (auth.uid() = photographer_id);

-- ── 2. push_notification_preferences: add inquiry column ──────────────

ALTER TABLE push_notification_preferences ADD COLUMN IF NOT EXISTS inquiry boolean NOT NULL DEFAULT true;

-- ── 3. Gallery activity push trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_gallery_activity_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_photographer_id uuid;
  v_push_enabled boolean;
begin
  if new.action not in ('favorite', 'comment', 'download_single', 'download_all') then
    return new;
  end if;

  select g.photographer_id into v_photographer_id
  from galleries g where g.id = new.gallery_id;

  if v_photographer_id is null then
    return new;
  end if;

  if new.action = 'favorite' then
    select favorite into v_push_enabled from push_notification_preferences where photographer_id = v_photographer_id;
  elsif new.action = 'comment' then
    select comment into v_push_enabled from push_notification_preferences where photographer_id = v_photographer_id;
  else
    select download into v_push_enabled from push_notification_preferences where photographer_id = v_photographer_id;
  end if;

  -- comment/favorite/download all default OFF at the table level (019) --
  -- unlike claim/contract/questionnaire/inquiry, which default ON. A
  -- missing preferences row means "use the table's defaults", so this
  -- coalesces to false, not true.
  if coalesce(v_push_enabled, false) then
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'activity_push_secret';

    perform net.http_post(
      url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-activity-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Activity-Push-Secret', v_secret
      ),
      body := jsonb_build_object('activityLogId', new.id)
    );
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_notify_gallery_activity_push ON gallery_activity_log;
CREATE TRIGGER trg_notify_gallery_activity_push
  AFTER INSERT ON gallery_activity_log
  FOR EACH ROW
  EXECUTE FUNCTION notify_gallery_activity_push();

-- ── 4. submit_signup_inquiry: add preference-gated inquiry push ───────
-- Only change from 075's version: a new push-send block after the
-- existing bell notification insert, same pattern as claim/questionnaire.

CREATE OR REPLACE FUNCTION public.submit_signup_inquiry(p_token text, p_shoot_type_id uuid, p_date date, p_time time without time zone, p_first_name text, p_last_name text, p_email text, p_phone text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_page signup_pages;
  v_shoot_type signup_shoot_types;
  v_window signup_inquiry_windows;
  v_end_time time;
  v_daily_count int;
  v_conflict_count int;
  v_full_name text;
  v_client_id uuid;
  v_session_id uuid;
  v_resend_key text;
  v_photographer record;
  v_photographer_auth_email text;
  v_notify_email text;
  v_sender_name text;
  v_logo_url text;
  v_icon_row text;
  v_local_date text;
  v_local_time text;
  v_local_time_end text;
  v_session_url text;
  v_html text;
  v_notify_html text;
  v_buffered_start time;
  v_buffered_end time;
  v_inquiry_push_enabled boolean;
  v_inquiry_secret text;
BEGIN
  v_full_name := trim(p_first_name || ' ' || p_last_name);

  SELECT * INTO v_page FROM signup_pages WHERE token = p_token;
  IF v_page IS NULL OR NOT v_page.is_active OR v_page.mode <> 'inquiry' THEN
    RETURN json_build_object('success', false, 'error', 'page_not_available');
  END IF;

  SELECT * INTO v_shoot_type FROM signup_shoot_types
  WHERE id = p_shoot_type_id AND signup_page_id = v_page.id;
  IF v_shoot_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'shoot_type_not_found');
  END IF;

  -- Serializes concurrent submissions for the same page+date -- without
  -- this, two near-simultaneous requests could both pass the cap/overlap
  -- checks below before either had actually inserted its session row.
  -- Held for the rest of this transaction, auto-released on commit.
  PERFORM pg_advisory_xact_lock(hashtext(v_page.id::text || p_date::text));

  v_end_time := p_time + (v_shoot_type.duration_minutes || ' minutes')::interval;

  SELECT * INTO v_window
  FROM signup_inquiry_windows
  WHERE signup_page_id = v_page.id
    AND p_date BETWEEN start_date AND end_date
    AND EXTRACT(DOW FROM p_date)::int = ANY(days_of_week)
    AND p_time >= start_time
    AND v_end_time <= end_time
  LIMIT 1;

  IF v_window IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'outside_window');
  END IF;

  IF v_page.max_daily_inquiries IS NOT NULL THEN
    SELECT count(*) INTO v_daily_count
    FROM sessions
    WHERE signup_page_id = v_page.id
      AND session_date = p_date
      AND status <> 'archived';

    IF v_daily_count >= v_page.max_daily_inquiries THEN
      RETURN json_build_object('success', false, 'error', 'day_full');
    END IF;
  END IF;

  v_buffered_start := GREATEST('00:00:00'::time, p_time - (v_page.buffer_minutes || ' minutes')::interval);
  v_buffered_end := LEAST('23:59:59'::time, v_end_time + (v_page.buffer_minutes || ' minutes')::interval);

  SELECT count(*) INTO v_conflict_count
  FROM sessions
  WHERE signup_page_id = v_page.id
    AND session_date = p_date
    AND status <> 'archived'
    AND start_time < v_buffered_end
    AND end_time > v_buffered_start;

  IF v_conflict_count > 0 THEN
    RETURN json_build_object('success', false, 'error', 'time_conflict');
  END IF;

  SELECT id INTO v_client_id
  FROM clients
  WHERE photographer_id = v_page.photographer_id
    AND lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (photographer_id, first_name, last_name, email, phone, pronouns, created_at, updated_at)
    VALUES (v_page.photographer_id, p_first_name, p_last_name, p_email, p_phone, p_pronouns, now(), now())
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO sessions (
    photographer_id, client_id, name, type, mode, status,
    session_date, start_time, end_time, location, submit_token, signup_page_id,
    session_fee, retainer_amount, created_at, updated_at
  ) VALUES (
    v_page.photographer_id, v_client_id,
    v_shoot_type.name || ' inquiry — ' || v_full_name, v_shoot_type.session_type, 'private', 'inquiry',
    p_date, p_time, v_end_time, v_page.venue_address,
    replace(gen_random_uuid()::text, '-', ''), v_page.id,
    v_shoot_type.price, v_shoot_type.retainer_amount,
    now(), now()
  )
  RETURNING id INTO v_session_id;

  BEGIN
    INSERT INTO session_questionnaires (session_id, questionnaire_id, sort_order)
    SELECT v_session_id, stq.questionnaire_id, stq.sort_order
    FROM signup_shoot_type_questionnaires stq
    WHERE stq.shoot_type_id = v_shoot_type.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to assign questionnaires to session: %', SQLERRM;
  END;

  -- In-app bell notification -- same notifications table claim_signup_slot's
  -- own trigger already writes to.
  BEGIN
    INSERT INTO notifications (photographer_id, type, title, body, url)
    VALUES (
      v_page.photographer_id,
      'inquiry_submitted',
      v_full_name || ' sent an inquiry',
      v_shoot_type.name || ' · ' || to_char(p_date, 'FMDay, FMMonth FMDD') || ' around ' || to_char(p_time, 'FMHH12:MI AM') || ' – ' || to_char(v_end_time, 'FMHH12:MI AM'),
      '/sessions/' || v_session_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to insert inquiry notification: %', SQLERRM;
  END;

  -- Preference-gated push, same pattern as notify_claim_push /
  -- notify_questionnaire_push. Defaults to true (matching the inquiry
  -- column's table default) if no preferences row exists yet.
  BEGIN
    SELECT inquiry INTO v_inquiry_push_enabled
    FROM push_notification_preferences
    WHERE photographer_id = v_page.photographer_id;

    IF COALESCE(v_inquiry_push_enabled, true) THEN
      SELECT decrypted_secret INTO v_inquiry_secret
      FROM vault.decrypted_secrets
      WHERE name = 'inquiry_push_secret';

      PERFORM net.http_post(
        url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-inquiry-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Inquiry-Push-Secret', v_inquiry_secret
        ),
        body := jsonb_build_object('sessionId', v_session_id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send inquiry push: %', SQLERRM;
  END;

  BEGIN
    SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';

    SELECT display_name, business_name, business_email, logo_r2_key, social_links, payment_links INTO v_photographer
    FROM photographers WHERE id = v_page.photographer_id;

    SELECT email INTO v_photographer_auth_email FROM auth.users WHERE id = v_page.photographer_id;

    v_notify_email := COALESCE(NULLIF(v_photographer.business_email, ''), v_photographer_auth_email);
    v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'Your Photographer');
    v_logo_url := CASE WHEN v_photographer.logo_r2_key IS NOT NULL
      THEN 'https://finalvault-worker.sitranephotography.workers.dev/logo/' || v_photographer.logo_r2_key
      ELSE NULL END;
    v_icon_row := build_email_icon_row(v_photographer.social_links, v_photographer.payment_links);

    v_local_date := to_char(p_date, 'FMDay, FMMonth FMDD');
    v_local_time := to_char(p_time, 'FMHH12:MI AM');
    v_local_time_end := to_char(v_end_time, 'FMHH12:MI AM');
    v_session_url := 'https://final-vault.app/sessions/' || v_session_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to prepare inquiry emails: %', SQLERRM;
  END;

  -- Client confirmation -- no ICS attachment: there's no confirmed time
  -- yet for a calendar file to represent, unlike a slot claim.
  BEGIN
    IF v_resend_key IS NOT NULL THEN
      v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
        CASE WHEN v_logo_url IS NOT NULL
          THEN '<img src="' || v_logo_url || '" alt="' || v_sender_name || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
          ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || v_sender_name || '</p>'
        END ||
        '</td></tr>' ||
        '<tr><td style="padding:28px 32px;">' ||
        '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Inquiry received!</p>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || v_shoot_type.name || '</p>' ||
        '<p style="margin:0 0 4px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || v_full_name || ', ' || v_sender_name || ' will follow up to confirm your exact time.</p>' ||
        '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Here''s what you requested:</p>' ||
        CASE WHEN v_page.confirmation_note IS NOT NULL AND trim(v_page.confirmation_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:20px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(v_page.confirmation_note, E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:8px;">' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_shoot_type.name || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Requested date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Requested time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          CASE WHEN v_page.venue_address IS NOT NULL THEN
            '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || v_page.venue_address || '</td></tr>'
          ELSE '' END ||
        '</table>' ||
        '<p style="margin:8px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">This time is not yet confirmed -- ' || v_sender_name || ' will reach out to finalize it.</p>' ||
        v_icon_row ||
        '</td></tr>' ||
        '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
        '<p style="margin:0;color:#9ca3af;font-size:12px;">' || v_sender_name || '</p>' ||
        '</td></tr></table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', v_sender_name || ' <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(p_email),
          'subject', 'Inquiry received — ' || v_shoot_type.name,
          'html', v_html
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send inquiry client confirmation email: %', SQLERRM;
  END;

  BEGIN
    IF v_resend_key IS NOT NULL AND v_notify_email IS NOT NULL THEN
      v_notify_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        '<tr><td style="padding:18px 32px;border-bottom:1px solid #e5e7eb;">' ||
        '<span style="color:#111111;font-size:13px;font-weight:600;">New inquiry</span>' ||
        '<span style="float:right;color:#9ca3af;font-size:12px;">' || v_page.title || '</span>' ||
        '</td></tr>' ||
        '<tr><td style="padding:24px 32px;">' ||
        '<p style="margin:0 0 18px;color:#111111;font-size:18px;font-weight:700;">' || v_shoot_type.name || ' — ' || v_full_name || '</p>' ||
        CASE WHEN v_page.notification_note IS NOT NULL AND trim(v_page.notification_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(v_page.notification_note, E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:16px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Client</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_full_name ||
            CASE WHEN p_pronouns IS NOT NULL THEN ' <span style="color:#9ca3af;">(' || p_pronouns || ')</span>' ELSE '' END || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Email</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || p_email || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Phone</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(p_phone, '&mdash;') || '</td></tr>' ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Date</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_time || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(v_page.venue_address, '&mdash;') || '</td></tr>' ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#6366f1;border-radius:8px;text-align:center;">' ||
        '<a href="' || v_session_url || '" style="display:block;padding:12px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">View & confirm in FinalVault</a>' ||
        '</td></tr></table>' ||
        v_icon_row ||
        '</td></tr></table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'FinalVault <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(v_notify_email),
          'subject', 'New inquiry — ' || v_shoot_type.name || ' (' || v_full_name || ')',
          'html', v_notify_html
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send inquiry photographer notification email: %', SQLERRM;
  END;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'shoot_type', v_shoot_type.name,
    'requested_date', p_date,
    'requested_time', p_time,
    'venue', v_page.venue_address
  );
END;
$function$;

-- ── Deployment notes (not SQL -- do these after running this file) ────
--
-- 1. Generate two new random secrets:
--      openssl rand -hex 32   (run twice, once per secret)
--
-- 2. Store both in Supabase Vault (SQL editor):
--      select vault.create_secret('<value-1>', 'inquiry_push_secret');
--      select vault.create_secret('<value-2>', 'activity_push_secret');
--
-- 3. Set both as Edge Function secrets (terminal):
--      supabase secrets set INQUIRY_PUSH_SECRET=<value-1>
--      supabase secrets set ACTIVITY_PUSH_SECRET=<value-2>
--
-- 4. Deploy the two new Edge Functions (provided separately):
--      supabase functions deploy send-inquiry-push --no-verify-jwt
--      supabase functions deploy send-activity-push --no-verify-jwt
