-- Migration: 105_escape_booking_emails.sql
-- Security fix (Oct 25, 2026 audit): escape client-typed text in the
-- booking emails the database sends itself.
--
-- claim_signup_slot and submit_signup_inquiry run for ANONYMOUS visitors on
-- public booking pages. They put the visitor's typed name, email, phone and
-- pronouns straight into two emails: the confirmation sent to whatever
-- address the visitor typed, and the "New booking/inquiry" email to the
-- photographer. Anyone could therefore send a FinalVault-branded email with
-- their own links and buttons to any address, or plant them in yours.
-- move_signup_slot_booking, update_signup_slot_time and
-- update_session_status re-send those stored names later.
--
-- Each function below is the LIVE definition (exported Oct 25, 2026) with
-- one change: every value placed into the email HTML now goes through
-- fv_escape_html (already used by the review emails since 086). Conditions,
-- subjects, the .ics attachment and everything else are untouched. Grants
-- are kept (CREATE OR REPLACE).
--
-- ROLLBACK: run 105_rollback_booking_emails.sql (the unmodified live
-- definitions).

CREATE OR REPLACE FUNCTION public.claim_signup_slot(p_slot_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slot signup_slots;
  v_shoot_type signup_shoot_types;
  v_page signup_pages;
  v_client_id uuid;
  v_session_id uuid;
  v_full_name text;
  v_resend_key text;
  v_photographer record;
  v_photographer_auth_email text;
  v_notify_email text;
  v_sender_name text;
  v_logo_url text;
  v_dtstart text;
  v_dtend text;
  v_ics_summary text;
  v_ics_location text;
  v_ics text;
  v_ics_b64 text;
  v_gcal_url text;
  v_html text;
  v_notify_html text;
  v_local_date text;
  v_local_time_start text;
  v_local_time_end text;
  v_session_url text;
  v_icon_row text;
BEGIN
  v_full_name := trim(p_first_name || ' ' || p_last_name);

  BEGIN
    UPDATE signup_slots
    SET claimed_at = now(),
        client_name = v_full_name,
        client_email = p_email,
        client_phone = p_phone,
        client_pronouns = p_pronouns
    WHERE id = p_slot_id AND claimed_at IS NULL
    RETURNING * INTO v_slot;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN json_build_object('success', false, 'error', 'conflicts_with_existing_booking');
  END;

  IF v_slot IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'already_claimed');
  END IF;

  SELECT * INTO v_shoot_type FROM signup_shoot_types WHERE id = v_slot.shoot_type_id;
  SELECT * INTO v_page FROM signup_pages WHERE id = v_slot.signup_page_id;

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
    session_date, start_time, end_time, location, location_lat, location_lng,
    description, submit_token, session_fee, retainer_amount, created_at, updated_at
  )
  VALUES (
    v_page.photographer_id, v_client_id,
    v_shoot_type.name || ' — ' || v_full_name,
    v_shoot_type.session_type, 'private', 'inquiry',
    (v_slot.start_time AT TIME ZONE v_page.timezone)::date,
    (v_slot.start_time AT TIME ZONE v_page.timezone)::time,
    (v_slot.end_time AT TIME ZONE v_page.timezone)::time,
    v_page.venue_address, v_page.venue_lat, v_page.venue_lng,
    'Booked via ' || v_page.title,
    replace(gen_random_uuid()::text, '-', ''),
    v_shoot_type.price,
    v_shoot_type.retainer_amount,
    now(), now()
  )
  RETURNING id INTO v_session_id;

  UPDATE signup_slots SET session_id = v_session_id WHERE id = p_slot_id;

  BEGIN
    INSERT INTO session_questionnaires (session_id, questionnaire_id, sort_order)
    SELECT v_session_id, stq.questionnaire_id, stq.sort_order
    FROM signup_shoot_type_questionnaires stq
    WHERE stq.shoot_type_id = v_shoot_type.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to assign questionnaires to session: %', SQLERRM;
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

    v_dtstart := to_char(v_slot.start_time AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
    v_dtend := to_char(v_slot.end_time AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
    v_local_date := to_char(v_slot.start_time AT TIME ZONE v_page.timezone, 'FMDay, FMMonth FMDD');
    v_local_time_start := to_char(v_slot.start_time AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');
    v_local_time_end := to_char(v_slot.end_time AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');
    v_session_url := 'https://final-vault.app/sessions/' || v_session_id;

    v_ics_summary := replace(replace(v_shoot_type.name || ' — ' || v_page.title, ';', '\;'), ',', '\,');
    v_ics_location := COALESCE(replace(replace(v_page.venue_address, ';', '\;'), ',', '\,'), '');

    v_ics := 'BEGIN:VCALENDAR' || E'\r\n' ||
      'VERSION:2.0' || E'\r\n' ||
      'PRODID:-//FinalVault//Booking//EN' || E'\r\n' ||
      'METHOD:PUBLISH' || E'\r\n' ||
      'BEGIN:VEVENT' || E'\r\n' ||
      'UID:' || v_session_id || '@finalvault' || E'\r\n' ||
      'DTSTAMP:' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n' ||
      'DTSTART:' || v_dtstart || E'\r\n' ||
      'DTEND:' || v_dtend || E'\r\n' ||
      'SUMMARY:' || v_ics_summary || E'\r\n' ||
      CASE WHEN v_ics_location <> '' THEN 'LOCATION:' || v_ics_location || E'\r\n' ELSE '' END ||
      'DESCRIPTION:Booked via ' || replace(replace(v_page.title, ';', '\;'), ',', '\,') || E'\r\n' ||
      'ORGANIZER:mailto:noreply@mail.final-vault.app' || E'\r\n' ||
      'STATUS:CONFIRMED' || E'\r\n' ||
      'END:VEVENT' || E'\r\n' ||
      'END:VCALENDAR';

    v_ics_b64 := encode(convert_to(v_ics, 'UTF8'), 'base64');

    v_gcal_url := 'https://www.google.com/calendar/render?action=TEMPLATE&text=' ||
      replace(v_shoot_type.name || ' — ' || v_page.title, ' ', '+') ||
      '&dates=' || v_dtstart || '/' || v_dtend ||
      '&location=' || COALESCE(replace(replace(v_page.venue_address, ',', '%2C'), ' ', '+'), '') ||
      '&details=' || replace('Booked via ' || v_page.title, ' ', '+');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to prepare booking emails: %', SQLERRM;
  END;

  BEGIN
    IF v_resend_key IS NOT NULL THEN
      v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
        CASE WHEN v_logo_url IS NOT NULL
          THEN '<img src="' || public.fv_escape_html(v_logo_url) || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
          ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
        END ||
        '</td></tr>' ||
        '<tr><td style="padding:28px 32px;">' ||
        '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">You''re booked!</p>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_shoot_type.name) || '</p>' ||
        '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || public.fv_escape_html(v_full_name) || ', here are your booking details:</p>' ||
        CASE WHEN v_page.confirmation_note IS NOT NULL AND trim(v_page.confirmation_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:20px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(public.fv_escape_html(v_page.confirmation_note), E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_shoot_type.name) || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          CASE WHEN v_page.venue_address IS NOT NULL THEN
            '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_page.venue_address) || '</td></tr>'
          ELSE '' END ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
        '<a href="' || public.fv_escape_html(v_gcal_url) || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Add to Google Calendar</a>' ||
        '</td></tr></table>' ||
        '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">A calendar file is also attached, for Apple Calendar and Outlook.</p>' ||
        v_icon_row ||
        '</td></tr>' ||
        '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
        '<p style="margin:0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
        '</td></tr></table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', v_sender_name || ' <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(p_email),
          'subject', 'You''re booked — ' || v_shoot_type.name,
          'html', v_html,
          'attachments', jsonb_build_array(
            jsonb_build_object('filename', 'booking.ics', 'content', v_ics_b64)
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send client confirmation email: %', SQLERRM;
  END;

  BEGIN
    IF v_resend_key IS NOT NULL AND v_notify_email IS NOT NULL THEN
      v_notify_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
        '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
        '<tr><td style="padding:18px 32px;border-bottom:1px solid #e5e7eb;">' ||
        '<span style="color:#111111;font-size:13px;font-weight:600;">New booking</span>' ||
        '<span style="float:right;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_page.title) || '</span>' ||
        '</td></tr>' ||
        '<tr><td style="padding:24px 32px;">' ||
        '<p style="margin:0 0 18px;color:#111111;font-size:18px;font-weight:700;">' || public.fv_escape_html(v_shoot_type.name) || ' — ' || public.fv_escape_html(v_full_name) || '</p>' ||
        CASE WHEN v_page.notification_note IS NOT NULL AND trim(v_page.notification_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(public.fv_escape_html(v_page.notification_note), E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:16px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Client</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || public.fv_escape_html(v_full_name) ||
            CASE WHEN p_pronouns IS NOT NULL THEN ' <span style="color:#9ca3af;">(' || public.fv_escape_html(p_pronouns) || ')</span>' ELSE '' END || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Email</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || public.fv_escape_html(p_email) || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Phone</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(NULLIF(public.fv_escape_html(p_phone), ''), '&mdash;') || '</td></tr>' ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Date</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(NULLIF(public.fv_escape_html(v_page.venue_address), ''), '&mdash;') || '</td></tr>' ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;"><tr><td style="background:#6366f1;border-radius:8px;text-align:center;">' ||
        '<a href="' || v_session_url || '" style="display:block;padding:12px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">View session in FinalVault</a>' ||
        '</td></tr></table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="border:1px solid #e5e7eb;border-radius:8px;text-align:center;">' ||
        '<a href="' || public.fv_escape_html(v_gcal_url) || '" style="display:block;padding:10px 36px;color:#111111;font-size:12px;font-weight:600;text-decoration:none;">Add to Google Calendar</a>' ||
        '</td></tr></table>' ||
        v_icon_row ||
        '</td></tr></table></td></tr></table></body></html>';

      PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'FinalVault <noreply@mail.final-vault.app>',
          'to', jsonb_build_array(v_notify_email),
          'subject', 'New booking — ' || v_shoot_type.name || ' (' || v_full_name || ')',
          'html', v_notify_html,
          'attachments', jsonb_build_array(
            jsonb_build_object('filename', 'booking.ics', 'content', v_ics_b64)
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to send photographer notification email: %', SQLERRM;
  END;

  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'client_id', v_client_id,
    'start_time', v_slot.start_time,
    'end_time', v_slot.end_time,
    'venue', v_page.venue_address,
    'shoot_type', v_shoot_type.name
  );
END;
$function$;

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
          THEN '<img src="' || public.fv_escape_html(v_logo_url) || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
          ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
        END ||
        '</td></tr>' ||
        '<tr><td style="padding:28px 32px;">' ||
        '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Inquiry received!</p>' ||
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_shoot_type.name) || '</p>' ||
        '<p style="margin:0 0 4px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || public.fv_escape_html(v_full_name) || ', ' || public.fv_escape_html(v_sender_name) || ' will follow up to confirm your exact time.</p>' ||
        '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Here''s what you requested:</p>' ||
        CASE WHEN v_page.confirmation_note IS NOT NULL AND trim(v_page.confirmation_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:20px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(public.fv_escape_html(v_page.confirmation_note), E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:8px;">' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_shoot_type.name) || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Requested date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Requested time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          CASE WHEN v_page.venue_address IS NOT NULL THEN
            '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_page.venue_address) || '</td></tr>'
          ELSE '' END ||
        '</table>' ||
        '<p style="margin:8px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">This time is not yet confirmed -- ' || public.fv_escape_html(v_sender_name) || ' will reach out to finalize it.</p>' ||
        v_icon_row ||
        '</td></tr>' ||
        '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
        '<p style="margin:0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
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
        '<span style="float:right;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_page.title) || '</span>' ||
        '</td></tr>' ||
        '<tr><td style="padding:24px 32px;">' ||
        '<p style="margin:0 0 18px;color:#111111;font-size:18px;font-weight:700;">' || public.fv_escape_html(v_shoot_type.name) || ' — ' || public.fv_escape_html(v_full_name) || '</p>' ||
        CASE WHEN v_page.notification_note IS NOT NULL AND trim(v_page.notification_note) <> '' THEN
          '<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-bottom:16px;">' ||
          '<p style="margin:0;color:#374151;font-size:13px;line-height:1.6;">' || replace(public.fv_escape_html(v_page.notification_note), E'\n', '<br>') || '</p>' ||
          '</div>'
        ELSE '' END ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:16px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Client</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || public.fv_escape_html(v_full_name) ||
            CASE WHEN p_pronouns IS NOT NULL THEN ' <span style="color:#9ca3af;">(' || public.fv_escape_html(p_pronouns) || ')</span>' ELSE '' END || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Email</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || public.fv_escape_html(p_email) || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Phone</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(NULLIF(public.fv_escape_html(p_phone), ''), '&mdash;') || '</td></tr>' ||
        '</table>' ||
        '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;width:70px;color:#9ca3af;font-size:12px;">Date</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_date || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;">' || v_local_time || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
          '<tr><td style="padding:10px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:10px 16px;color:#111111;font-size:13px;">' || COALESCE(NULLIF(public.fv_escape_html(v_page.venue_address), ''), '&mdash;') || '</td></tr>' ||
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

CREATE OR REPLACE FUNCTION public.move_signup_slot_booking(p_source_slot_id uuid, p_target_slot_id uuid, p_notify_client boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_source signup_slots;
  v_target signup_slots;
  v_page signup_pages;
  v_new_shoot_type signup_shoot_types;
  v_old_shoot_type_name text;
  v_session_id uuid;
  v_resend_key text;
  v_photographer record;
  v_photographer_auth_email text;
  v_sender_name text;
  v_logo_url text;
  v_dtstart text;
  v_dtend text;
  v_ics_summary text;
  v_ics_location text;
  v_ics text;
  v_ics_b64 text;
  v_gcal_url text;
  v_html text;
  v_local_date text;
  v_local_time_start text;
  v_local_time_end text;
  v_email_warning text;
BEGIN
  SELECT * INTO v_source FROM signup_slots WHERE id = p_source_slot_id;
  SELECT * INTO v_target FROM signup_slots WHERE id = p_target_slot_id;

  IF v_source IS NULL OR v_target IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  IF v_source.claimed_at IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'source_not_claimed');
  END IF;

  IF v_target.claimed_at IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'target_already_claimed');
  END IF;

  IF v_source.signup_page_id <> v_target.signup_page_id THEN
    RETURN json_build_object('success', false, 'error', 'different_signup_page');
  END IF;

  SELECT * INTO v_page FROM signup_pages WHERE id = v_source.signup_page_id;

  IF auth.uid() IS DISTINCT FROM v_page.photographer_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT name INTO v_old_shoot_type_name FROM signup_shoot_types WHERE id = v_source.shoot_type_id;
  SELECT * INTO v_new_shoot_type FROM signup_shoot_types WHERE id = v_target.shoot_type_id;

  v_session_id := v_source.session_id;

  BEGIN
    PERFORM set_config('finalvault.suppress_claim_notification', 'true', true);
    UPDATE signup_slots
    SET claimed_at = v_source.claimed_at,
        client_name = v_source.client_name,
        client_email = v_source.client_email,
        client_phone = v_source.client_phone,
        client_pronouns = v_source.client_pronouns,
        photographer_note = v_source.photographer_note,
        session_id = v_source.session_id
    WHERE id = p_target_slot_id;
    PERFORM set_config('finalvault.suppress_claim_notification', 'false', true);
  EXCEPTION
    WHEN exclusion_violation THEN
      PERFORM set_config('finalvault.suppress_claim_notification', 'false', true);
      RETURN json_build_object('success', false, 'error', 'conflicts_with_existing_booking');
  END;

  UPDATE signup_slots
  SET claimed_at = NULL,
      client_name = NULL,
      client_email = NULL,
      client_phone = NULL,
      client_pronouns = NULL,
      photographer_note = NULL,
      session_id = NULL
  WHERE id = p_source_slot_id;

  IF v_session_id IS NOT NULL THEN
    UPDATE sessions
    SET session_date = (v_target.start_time AT TIME ZONE v_page.timezone)::date,
        start_time = (v_target.start_time AT TIME ZONE v_page.timezone)::time,
        end_time = (v_target.end_time AT TIME ZONE v_page.timezone)::time,
        type = COALESCE(v_new_shoot_type.session_type, type),
        name = CASE WHEN v_new_shoot_type.id <> v_source.shoot_type_id
                 THEN v_new_shoot_type.name || ' — ' || v_source.client_name
                 ELSE name END,
        updated_at = now()
    WHERE id = v_session_id;
  END IF;

  IF p_notify_client AND v_source.client_email IS NOT NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
      SELECT display_name, business_name, business_email, logo_r2_key INTO v_photographer
      FROM photographers WHERE id = v_page.photographer_id;
      SELECT email INTO v_photographer_auth_email FROM auth.users WHERE id = v_page.photographer_id;
      v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'Your Photographer');
      v_logo_url := CASE WHEN v_photographer.logo_r2_key IS NOT NULL
        THEN 'https://finalvault-worker.sitranephotography.workers.dev/logo/' || v_photographer.logo_r2_key
        ELSE NULL END;

      v_dtstart := to_char(v_target.start_time AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
      v_dtend := to_char(v_target.end_time AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
      v_local_date := to_char(v_target.start_time AT TIME ZONE v_page.timezone, 'FMDay, FMMonth FMDD');
      v_local_time_start := to_char(v_target.start_time AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');
      v_local_time_end := to_char(v_target.end_time AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');

      v_ics_summary := replace(replace(v_new_shoot_type.name || ' — ' || v_page.title, ';', '\;'), ',', '\,');
      v_ics_location := COALESCE(replace(replace(v_page.venue_address, ';', '\;'), ',', '\,'), '');

      v_ics := 'BEGIN:VCALENDAR' || E'\r\n' ||
        'VERSION:2.0' || E'\r\n' ||
        'PRODID:-//FinalVault//Booking//EN' || E'\r\n' ||
        'METHOD:PUBLISH' || E'\r\n' ||
        'BEGIN:VEVENT' || E'\r\n' ||
        'UID:' || v_session_id || '@finalvault' || E'\r\n' ||
        'SEQUENCE:1' || E'\r\n' ||
        'DTSTAMP:' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n' ||
        'DTSTART:' || v_dtstart || E'\r\n' ||
        'DTEND:' || v_dtend || E'\r\n' ||
        'SUMMARY:' || v_ics_summary || E'\r\n' ||
        CASE WHEN v_ics_location <> '' THEN 'LOCATION:' || v_ics_location || E'\r\n' ELSE '' END ||
        'DESCRIPTION:Updated booking via ' || replace(replace(v_page.title, ';', '\;'), ',', '\,') || E'\r\n' ||
        'ORGANIZER:mailto:noreply@mail.final-vault.app' || E'\r\n' ||
        'STATUS:CONFIRMED' || E'\r\n' ||
        'END:VEVENT' || E'\r\n' ||
        'END:VCALENDAR';
      v_ics_b64 := encode(convert_to(v_ics, 'UTF8'), 'base64');

      v_gcal_url := 'https://www.google.com/calendar/render?action=TEMPLATE&text=' ||
        replace(v_new_shoot_type.name || ' — ' || v_page.title, ' ', '+') ||
        '&dates=' || v_dtstart || '/' || v_dtend ||
        '&location=' || COALESCE(replace(replace(v_page.venue_address, ',', '%2C'), ' ', '+'), '') ||
        '&details=' || replace('Updated booking via ' || v_page.title, ' ', '+');

      IF v_resend_key IS NOT NULL THEN
        v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
          '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
          '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
          '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
          CASE WHEN v_logo_url IS NOT NULL
            THEN '<img src="' || public.fv_escape_html(v_logo_url) || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
            ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
          END ||
          '</td></tr>' ||
          '<tr><td style="padding:28px 32px;">' ||
          '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Your appointment time has changed</p>' ||
          '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_new_shoot_type.name) || '</p>' ||
          '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || public.fv_escape_html(v_source.client_name) || ', your booking has been moved to a new time. Here are the updated details:</p>' ||
          '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_new_shoot_type.name) || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
            CASE WHEN v_page.venue_address IS NOT NULL THEN
              '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_page.venue_address) || '</td></tr>'
            ELSE '' END ||
          '</table>' ||
          '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
          '<a href="' || public.fv_escape_html(v_gcal_url) || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Update Google Calendar</a>' ||
          '</td></tr></table>' ||
          '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">An updated calendar file is also attached.</p>' ||
          '</td></tr>' ||
          '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
          '<p style="margin:0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
          '</td></tr></table></td></tr></table></body></html>';

        PERFORM net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', v_sender_name || ' <noreply@mail.final-vault.app>',
            'to', jsonb_build_array(v_source.client_email),
            'subject', 'Your appointment time has changed — ' || v_new_shoot_type.name,
            'html', v_html,
            'attachments', jsonb_build_array(
              jsonb_build_object('filename', 'booking-updated.ics', 'content', v_ics_b64)
            )
          )
        );
      ELSE
        v_email_warning := 'resend_api_key not found in vault';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_email_warning := SQLERRM;
      RAISE WARNING 'Failed to send reschedule notification email: %', SQLERRM;
    END;
  END IF;

  RETURN json_build_object('success', true, 'target_slot_id', p_target_slot_id, 'email_warning', v_email_warning);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_signup_slot_time(p_slot_id uuid, p_new_start timestamp with time zone, p_new_end timestamp with time zone, p_notify_client boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slot signup_slots;
  v_page signup_pages;
  v_shoot_type signup_shoot_types;
  v_resend_key text;
  v_photographer record;
  v_sender_name text;
  v_logo_url text;
  v_dtstart text;
  v_dtend text;
  v_ics_summary text;
  v_ics_location text;
  v_ics text;
  v_ics_b64 text;
  v_gcal_url text;
  v_html text;
  v_local_date text;
  v_local_time_start text;
  v_local_time_end text;
  v_email_warning text;
BEGIN
  SELECT * INTO v_slot FROM signup_slots WHERE id = p_slot_id;

  IF v_slot IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  IF v_slot.claimed_at IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_claimed');
  END IF;

  SELECT * INTO v_page FROM signup_pages WHERE id = v_slot.signup_page_id;

  IF auth.uid() IS DISTINCT FROM v_page.photographer_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_shoot_type FROM signup_shoot_types WHERE id = v_slot.shoot_type_id;

  BEGIN
    UPDATE signup_slots
    SET start_time = p_new_start, end_time = p_new_end
    WHERE id = p_slot_id
    RETURNING * INTO v_slot;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN json_build_object('success', false, 'error', 'conflicts_with_existing_booking');
    WHEN check_violation THEN
      RETURN json_build_object('success', false, 'error', 'end_before_start');
  END;

  IF v_slot.session_id IS NOT NULL THEN
    UPDATE sessions
    SET session_date = (p_new_start AT TIME ZONE v_page.timezone)::date,
        start_time = (p_new_start AT TIME ZONE v_page.timezone)::time,
        end_time = (p_new_end AT TIME ZONE v_page.timezone)::time,
        updated_at = now()
    WHERE id = v_slot.session_id;
  END IF;

  IF p_notify_client AND v_slot.client_email IS NOT NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
      SELECT display_name, business_name, business_email, logo_r2_key INTO v_photographer
      FROM photographers WHERE id = v_page.photographer_id;
      v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'Your Photographer');
      v_logo_url := CASE WHEN v_photographer.logo_r2_key IS NOT NULL
        THEN 'https://finalvault-worker.sitranephotography.workers.dev/logo/' || v_photographer.logo_r2_key
        ELSE NULL END;

      v_dtstart := to_char(p_new_start AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
      v_dtend := to_char(p_new_end AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
      v_local_date := to_char(p_new_start AT TIME ZONE v_page.timezone, 'FMDay, FMMonth FMDD');
      v_local_time_start := to_char(p_new_start AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');
      v_local_time_end := to_char(p_new_end AT TIME ZONE v_page.timezone, 'FMHH12:MI AM');

      v_ics_summary := replace(replace(v_shoot_type.name || ' — ' || v_page.title, ';', '\;'), ',', '\,');
      v_ics_location := COALESCE(replace(replace(v_page.venue_address, ';', '\;'), ',', '\,'), '');

      v_ics := 'BEGIN:VCALENDAR' || E'\r\n' ||
        'VERSION:2.0' || E'\r\n' ||
        'PRODID:-//FinalVault//Booking//EN' || E'\r\n' ||
        'METHOD:PUBLISH' || E'\r\n' ||
        'BEGIN:VEVENT' || E'\r\n' ||
        'UID:' || v_slot.session_id || '@finalvault' || E'\r\n' ||
        'SEQUENCE:1' || E'\r\n' ||
        'DTSTAMP:' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n' ||
        'DTSTART:' || v_dtstart || E'\r\n' ||
        'DTEND:' || v_dtend || E'\r\n' ||
        'SUMMARY:' || v_ics_summary || E'\r\n' ||
        CASE WHEN v_ics_location <> '' THEN 'LOCATION:' || v_ics_location || E'\r\n' ELSE '' END ||
        'DESCRIPTION:Updated booking via ' || replace(replace(v_page.title, ';', '\;'), ',', '\,') || E'\r\n' ||
        'ORGANIZER:mailto:noreply@mail.final-vault.app' || E'\r\n' ||
        'STATUS:CONFIRMED' || E'\r\n' ||
        'END:VEVENT' || E'\r\n' ||
        'END:VCALENDAR';
      v_ics_b64 := encode(convert_to(v_ics, 'UTF8'), 'base64');

      v_gcal_url := 'https://www.google.com/calendar/render?action=TEMPLATE&text=' ||
        replace(v_shoot_type.name || ' — ' || v_page.title, ' ', '+') ||
        '&dates=' || v_dtstart || '/' || v_dtend ||
        '&location=' || COALESCE(replace(replace(v_page.venue_address, ',', '%2C'), ' ', '+'), '') ||
        '&details=' || replace('Updated booking via ' || v_page.title, ' ', '+');

      IF v_resend_key IS NOT NULL THEN
        v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
          '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
          '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
          '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
          CASE WHEN v_logo_url IS NOT NULL
            THEN '<img src="' || public.fv_escape_html(v_logo_url) || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
            ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
          END ||
          '</td></tr>' ||
          '<tr><td style="padding:28px 32px;">' ||
          '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Your appointment time has changed</p>' ||
          '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_shoot_type.name) || '</p>' ||
          '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || public.fv_escape_html(v_slot.client_name) || ', your booking time has been updated. Here are the new details:</p>' ||
          '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_shoot_type.name) || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
            CASE WHEN v_page.venue_address IS NOT NULL THEN
              '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_page.venue_address) || '</td></tr>'
            ELSE '' END ||
          '</table>' ||
          '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
          '<a href="' || public.fv_escape_html(v_gcal_url) || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Update Google Calendar</a>' ||
          '</td></tr></table>' ||
          '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">An updated calendar file is also attached.</p>' ||
          '</td></tr>' ||
          '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
          '<p style="margin:0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
          '</td></tr></table></td></tr></table></body></html>';

        PERFORM net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', v_sender_name || ' <noreply@mail.final-vault.app>',
            'to', jsonb_build_array(v_slot.client_email),
            'subject', 'Your appointment time has changed — ' || v_shoot_type.name,
            'html', v_html,
            'attachments', jsonb_build_array(
              jsonb_build_object('filename', 'booking-updated.ics', 'content', v_ics_b64)
            )
          )
        );
      ELSE
        v_email_warning := 'resend_api_key not found in vault';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_email_warning := SQLERRM;
      RAISE WARNING 'Failed to send reschedule notification email: %', SQLERRM;
    END;
  END IF;

  RETURN json_build_object('success', true, 'start_time', v_slot.start_time, 'end_time', v_slot.end_time, 'email_warning', v_email_warning);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_session_status(p_session_id uuid, p_new_status text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_session sessions;
  v_old_status text;
  v_client record;
  v_page signup_pages;
  v_has_slot boolean;
  v_resend_key text;
  v_photographer record;
  v_sender_name text;
  v_logo_url text;
  v_icon_row text;
  v_full_name text;
  v_local_date text;
  v_local_time_start text;
  v_local_time_end text;
  v_dtstart text;
  v_dtend text;
  v_ics_summary text;
  v_ics_location text;
  v_ics text;
  v_ics_b64 text;
  v_gcal_url text;
  v_html text;
  v_email_warning text;
BEGIN
  IF p_new_status NOT IN ('inquiry', 'booked', 'completed', 'delivered', 'archived') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM v_session.photographer_id THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_old_status := v_session.status;

  UPDATE sessions
  SET status = p_new_status, updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Only the inquiry -> booked transition has a side effect.
  IF v_old_status = 'inquiry' AND p_new_status = 'booked' THEN
    SELECT EXISTS(SELECT 1 FROM signup_slots WHERE session_id = v_session.id) INTO v_has_slot;

    IF NOT v_has_slot AND v_session.client_id IS NOT NULL
       AND v_session.session_date IS NOT NULL AND v_session.start_time IS NOT NULL THEN
      BEGIN
        SELECT first_name, last_name, email INTO v_client FROM clients WHERE id = v_session.client_id;

        IF v_client.email IS NOT NULL AND trim(v_client.email) <> '' THEN
          v_full_name := trim(coalesce(v_client.first_name, '') || ' ' || coalesce(v_client.last_name, ''));

          IF v_session.signup_page_id IS NOT NULL THEN
            SELECT * INTO v_page FROM signup_pages WHERE id = v_session.signup_page_id;
          END IF;

          SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key';
          SELECT display_name, business_name, logo_r2_key, social_links, payment_links INTO v_photographer
          FROM photographers WHERE id = v_session.photographer_id;

          v_sender_name := COALESCE(NULLIF(v_photographer.business_name, ''), v_photographer.display_name, 'Your Photographer');
          v_logo_url := CASE WHEN v_photographer.logo_r2_key IS NOT NULL
            THEN 'https://finalvault-worker.sitranephotography.workers.dev/logo/' || v_photographer.logo_r2_key
            ELSE NULL END;
          v_icon_row := build_email_icon_row(v_photographer.social_links, v_photographer.payment_links);

          v_local_date := to_char(v_session.session_date, 'FMDay, FMMonth FMDD');
          v_local_time_start := to_char(v_session.start_time, 'FMHH12:MI AM');
          v_local_time_end := CASE WHEN v_session.end_time IS NOT NULL
            THEN to_char(v_session.end_time, 'FMHH12:MI AM') ELSE NULL END;

          v_ics_summary := replace(replace(v_session.name, ';', '\;'), ',', '\,');
          v_ics_location := COALESCE(replace(replace(v_session.location, ';', '\;'), ',', '\,'), '');

          IF v_page.timezone IS NOT NULL THEN
            -- Real timezone known (inquiry-page session) -- proper UTC instant.
            v_dtstart := to_char(
              ((v_session.session_date + v_session.start_time)::timestamp AT TIME ZONE v_page.timezone) AT TIME ZONE 'UTC',
              'YYYYMMDD"T"HH24MISS"Z"');
            v_dtend := to_char(
              ((v_session.session_date + COALESCE(v_session.end_time, v_session.start_time))::timestamp AT TIME ZONE v_page.timezone) AT TIME ZONE 'UTC',
              'YYYYMMDD"T"HH24MISS"Z"');
          ELSE
            -- No timezone context (manually-created session) -- floating
            -- local time, no Z suffix, no TZID -- every calendar app shows
            -- the literal date/time as entered rather than converting it.
            v_dtstart := to_char(v_session.session_date + v_session.start_time, 'YYYYMMDD"T"HH24MISS');
            v_dtend := to_char(v_session.session_date + COALESCE(v_session.end_time, v_session.start_time), 'YYYYMMDD"T"HH24MISS');
          END IF;

          v_ics := 'BEGIN:VCALENDAR' || E'\r\n' ||
            'VERSION:2.0' || E'\r\n' ||
            'PRODID:-//FinalVault//Booking//EN' || E'\r\n' ||
            'METHOD:PUBLISH' || E'\r\n' ||
            'BEGIN:VEVENT' || E'\r\n' ||
            'UID:' || v_session.id || '@finalvault' || E'\r\n' ||
            'DTSTAMP:' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n' ||
            'DTSTART:' || v_dtstart || E'\r\n' ||
            'DTEND:' || v_dtend || E'\r\n' ||
            'SUMMARY:' || v_ics_summary || E'\r\n' ||
            CASE WHEN v_ics_location <> '' THEN 'LOCATION:' || v_ics_location || E'\r\n' ELSE '' END ||
            'DESCRIPTION:Your session is confirmed' || E'\r\n' ||
            'ORGANIZER:mailto:noreply@mail.final-vault.app' || E'\r\n' ||
            'STATUS:CONFIRMED' || E'\r\n' ||
            'END:VEVENT' || E'\r\n' ||
            'END:VCALENDAR';

          v_ics_b64 := encode(convert_to(v_ics, 'UTF8'), 'base64');

          v_gcal_url := 'https://www.google.com/calendar/render?action=TEMPLATE&text=' ||
            replace(v_session.name, ' ', '+') ||
            '&dates=' || v_dtstart || '/' || v_dtend ||
            '&location=' || COALESCE(replace(replace(v_session.location, ',', '%2C'), ' ', '+'), '') ||
            '&details=' || replace('Your session with ' || v_sender_name || ' is confirmed', ' ', '+');

          IF v_resend_key IS NOT NULL THEN
            v_html := '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif;">' ||
              '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;"><tr><td align="center">' ||
              '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">' ||
              '<tr><td style="background:#111111;padding:24px 32px;text-align:center;">' ||
              CASE WHEN v_logo_url IS NOT NULL
                THEN '<img src="' || public.fv_escape_html(v_logo_url) || '" alt="' || public.fv_escape_html(v_sender_name) || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
                ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || public.fv_escape_html(v_sender_name) || '</p>'
              END ||
              '</td></tr>' ||
              '<tr><td style="padding:28px 32px;">' ||
              '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">You''re confirmed!</p>' ||
              '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || public.fv_escape_html(v_session.type) || '</p>' ||
              '<p style="margin:0 0 4px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || public.fv_escape_html(v_full_name) || ', your session with ' || public.fv_escape_html(v_sender_name) || ' is officially booked.</p>' ||
              '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Here are your confirmed details:</p>' ||
              '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
                '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_session.type) || '</td></tr>' ||
                '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
                '<tr><td style="padding:12px 16px;' || CASE WHEN v_session.location IS NOT NULL THEN 'border-bottom:1px solid #e5e7eb;' ELSE '' END || 'color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;' || CASE WHEN v_session.location IS NOT NULL THEN 'border-bottom:1px solid #e5e7eb;' ELSE '' END || 'color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || COALESCE(' &ndash; ' || v_local_time_end, '') || '</td></tr>' ||
                CASE WHEN v_session.location IS NOT NULL THEN
                  '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || public.fv_escape_html(v_session.location) || '</td></tr>'
                ELSE '' END ||
              '</table>' ||
              '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
              '<a href="' || public.fv_escape_html(v_gcal_url) || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Add to Google Calendar</a>' ||
              '</td></tr></table>' ||
              '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">A calendar file is also attached, for Apple Calendar and Outlook.</p>' ||
              v_icon_row ||
              '</td></tr>' ||
              '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
              '<p style="margin:0;color:#9ca3af;font-size:12px;">' || public.fv_escape_html(v_sender_name) || '</p>' ||
              '</td></tr></table></td></tr></table></body></html>';

            PERFORM net.http_post(
              url := 'https://api.resend.com/emails',
              headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
              body := jsonb_build_object(
                'from', v_sender_name || ' <noreply@mail.final-vault.app>',
                'to', jsonb_build_array(v_client.email),
                'subject', 'You''re confirmed — ' || v_session.name,
                'html', v_html,
                'attachments', jsonb_build_array(
                  jsonb_build_object('filename', 'booking-confirmed.ics', 'content', v_ics_b64)
                )
              )
            );
          ELSE
            v_email_warning := 'resend_api_key not found in vault';
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_email_warning := SQLERRM;
        RAISE WARNING 'Failed to send booking confirmation email: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'session', row_to_json(v_session), 'email_warning', v_email_warning);
END;
$function$;
