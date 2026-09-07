-- Migration: 069_session_status_confirmation_email.sql
-- Feature: update_session_status(session_id, new_status) RPC -- replaces
-- the frontend's raw `sessions` table UPDATE for status changes
-- (Sessions.jsx kanban drag, SessionDetail.jsx status pills) so a status
-- transition can trigger a server-side side effect and surface any
-- failure back to the caller, same email_warning pattern
-- 022_fix_reschedule_side_effects.sql established for exactly this
-- "failure was silently swallowed" problem.
--
-- The only side effect today: moving a session from 'inquiry' to
-- 'booked' sends the client a real confirmation email with an ICS
-- attachment -- the second of the two emails Nick asked for (the first,
-- "Inquiry received!", already exists in submit_signup_inquiry and is
-- completely untouched by this migration).
--
-- Deliberately excluded: sessions created by claim_signup_slot. Those
-- are ALSO inserted with status='inquiry' (confirmed via live
-- pg_get_functiondef inspection) but already get a full "You're
-- booked!" confirmation + ICS at claim time -- sending a second
-- confirmation when the photographer later drags that card to Booked
-- would double-email the client. Detected via signup_slots.session_id
-- linkage: any session with a matching signup_slots row is a slot
-- booking and is skipped here regardless of status history.
--
-- Timezone handling: inquiry-page sessions carry signup_page_id, so the
-- true page timezone is used to compute a real UTC instant for the ICS
-- (same AT TIME ZONE idiom claim_signup_slot uses). Manually-created
-- sessions have no timezone anywhere in the schema (confirmed live: no
-- account-level default on `photographers`, only the per-signup-page
-- column) -- those get a floating-time ICS (no Z suffix, no TZID) per
-- Nick's explicit call, so every calendar app shows the literal
-- date/time as entered rather than guessing a zone.
--
-- Run after: 065_inquiry_submit_by_token.sql
-- Run this whole file in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.update_session_status(
  p_session_id uuid,
  p_new_status text
)
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
                THEN '<img src="' || v_logo_url || '" alt="' || v_sender_name || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
                ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || v_sender_name || '</p>'
              END ||
              '</td></tr>' ||
              '<tr><td style="padding:28px 32px;">' ||
              '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">You''re confirmed!</p>' ||
              '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || v_session.type || '</p>' ||
              '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || v_full_name || ', your session with ' || v_sender_name || ' is officially booked. Here are your confirmed details:</p>' ||
              '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
                '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_session.type || '</td></tr>' ||
                '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
                '<tr><td style="padding:12px 16px;' || CASE WHEN v_session.location IS NOT NULL THEN 'border-bottom:1px solid #e5e7eb;' ELSE '' END || 'color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;' || CASE WHEN v_session.location IS NOT NULL THEN 'border-bottom:1px solid #e5e7eb;' ELSE '' END || 'color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || COALESCE(' &ndash; ' || v_local_time_end, '') || '</td></tr>' ||
                CASE WHEN v_session.location IS NOT NULL THEN
                  '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || v_session.location || '</td></tr>'
                ELSE '' END ||
              '</table>' ||
              '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
              '<a href="' || v_gcal_url || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Add to Google Calendar</a>' ||
              '</td></tr></table>' ||
              '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">A calendar file is also attached, for Apple Calendar and Outlook.</p>' ||
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
