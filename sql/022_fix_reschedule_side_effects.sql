-- Migration: 022_fix_reschedule_side_effects.sql
-- Fixes two real bugs found testing 021_modify_bookings.sql through the
-- actual UI:
--
-- 1. move_signup_slot_booking sets claimed_at (null -> a real timestamp)
--    on the TARGET slot as part of relocating a booking there -- which is
--    exactly the condition notify_claim_push() watches for to fire a
--    push notification and insert a bell entry. That trigger doesn't
--    know the difference between "a client just claimed this" and "the
--    photographer just moved an existing booking here", so every move
--    was incorrectly firing a "new booking" push + bell entry. Fixed via
--    a transaction-local flag the trigger checks and skips on, set right
--    around the one UPDATE that needs to suppress it.
--
-- 2. Both RPCs' notification-email blocks swallow any error via
--    EXCEPTION WHEN OTHERS -> RAISE WARNING, which only lands in the
--    Postgres logs -- invisible to both the calling frontend and anyone
--    testing via the SQL Editor. Now captured into an `email_warning`
--    field in the JSON response instead, so a failed send is actually
--    visible without digging through logs.
--
-- Run after: 021_modify_bookings.sql

CREATE OR REPLACE FUNCTION public.notify_claim_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_photographer_id uuid;
  v_shoot_type_name text;
  v_timezone text;
  v_push_enabled boolean;
begin
  -- Set by move_signup_slot_booking right before the one UPDATE that
  -- relocates a booking onto a previously-open slot -- that's a real
  -- claimed_at transition at the row level, but not an actual new claim,
  -- so it shouldn't fire a push notification or bell entry.
  if coalesce(current_setting('finalvault.suppress_claim_notification', true), '') = 'true' then
    return new;
  end if;

  if new.claimed_at is not null and old.claimed_at is null then
    select sp.photographer_id, sp.timezone, st.name
      into v_photographer_id, v_timezone, v_shoot_type_name
    from signup_pages sp
    left join signup_shoot_types st on st.id = new.shoot_type_id
    where sp.id = new.signup_page_id;

    if v_photographer_id is not null then
      insert into notifications (photographer_id, type, title, body, url)
      values (
        v_photographer_id,
        'slot_claimed',
        coalesce(new.client_name, 'Someone') || ' claimed a slot',
        coalesce(v_shoot_type_name, 'Unknown shoot type') || ' · ' ||
          to_char(new.start_time at time zone coalesce(v_timezone, 'UTC'), 'FMHH12:MI AM'),
        '/sessions/signups/' || new.signup_page_id || '/status'
      );

      select claim into v_push_enabled
      from push_notification_preferences
      where photographer_id = v_photographer_id;

      if coalesce(v_push_enabled, true) then
        select decrypted_secret into v_secret
        from vault.decrypted_secrets
        where name = 'claim_push_secret';

        perform net.http_post(
          url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-claim-push',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Claim-Push-Secret', v_secret
          ),
          body := jsonb_build_object('slotId', new.id)
        );
      end if;
    end if;
  end if;
  return new;
end;
$function$;

-- move_signup_slot_booking: suppress the claim-push trigger around the
-- target slot's UPDATE, and surface any email-send error in the response
-- instead of silently swallowing it.
CREATE OR REPLACE FUNCTION public.move_signup_slot_booking(
  p_source_slot_id uuid,
  p_target_slot_id uuid,
  p_notify_client boolean DEFAULT false
)
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
        'ORGANIZER:mailto:noreply@dockercapphotography.com' || E'\r\n' ||
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
            THEN '<img src="' || v_logo_url || '" alt="' || v_sender_name || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
            ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || v_sender_name || '</p>'
          END ||
          '</td></tr>' ||
          '<tr><td style="padding:28px 32px;">' ||
          '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Your appointment time has changed</p>' ||
          '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || v_new_shoot_type.name || '</p>' ||
          '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || v_source.client_name || ', your booking has been moved to a new time. Here are the updated details:</p>' ||
          '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_new_shoot_type.name || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
            CASE WHEN v_page.venue_address IS NOT NULL THEN
              '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || v_page.venue_address || '</td></tr>'
            ELSE '' END ||
          '</table>' ||
          '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
          '<a href="' || v_gcal_url || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Update Google Calendar</a>' ||
          '</td></tr></table>' ||
          '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">An updated calendar file is also attached.</p>' ||
          '</td></tr>' ||
          '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
          '<p style="margin:0;color:#9ca3af;font-size:12px;">' || v_sender_name || '</p>' ||
          '</td></tr></table></td></tr></table></body></html>';

        PERFORM net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', v_sender_name || ' <noreply@dockercapphotography.com>',
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

-- update_signup_slot_time: same email-error-surfacing fix. No claim-push
-- suppression needed here -- this RPC never touches claimed_at, so it was
-- never able to trigger notify_claim_push() in the first place.
CREATE OR REPLACE FUNCTION public.update_signup_slot_time(
  p_slot_id uuid,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_notify_client boolean DEFAULT false
)
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
        'ORGANIZER:mailto:noreply@dockercapphotography.com' || E'\r\n' ||
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
            THEN '<img src="' || v_logo_url || '" alt="' || v_sender_name || '" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />'
            ELSE '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">' || v_sender_name || '</p>'
          END ||
          '</td></tr>' ||
          '<tr><td style="padding:28px 32px;">' ||
          '<p style="margin:0 0 4px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Your appointment time has changed</p>' ||
          '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">' || v_shoot_type.name || '</p>' ||
          '<p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7;">Hi ' || v_slot.client_name || ', your booking time has been updated. Here are the new details:</p>' ||
          '<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:90px;color:#9ca3af;font-size:12px;">Shoot type</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_shoot_type.name || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Date</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_date || '</td></tr>' ||
            '<tr><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">Time</td><td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111111;font-size:13px;font-weight:600;">' || v_local_time_start || ' &ndash; ' || v_local_time_end || '</td></tr>' ||
            CASE WHEN v_page.venue_address IS NOT NULL THEN
              '<tr><td style="padding:12px 16px;color:#9ca3af;font-size:12px;">Venue</td><td style="padding:12px 16px;color:#111111;font-size:13px;font-weight:600;">' || v_page.venue_address || '</td></tr>'
            ELSE '' END ||
          '</table>' ||
          '<table cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:#111111;border-radius:8px;text-align:center;">' ||
          '<a href="' || v_gcal_url || '" style="display:block;padding:14px 36px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Update Google Calendar</a>' ||
          '</td></tr></table>' ||
          '<p style="margin:14px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">An updated calendar file is also attached.</p>' ||
          '</td></tr>' ||
          '<tr><td style="padding:18px 32px;border-top:1px solid #f3f4f6;text-align:center;">' ||
          '<p style="margin:0;color:#9ca3af;font-size:12px;">' || v_sender_name || '</p>' ||
          '</td></tr></table></td></tr></table></body></html>';

        PERFORM net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Authorization', 'Bearer ' || v_resend_key, 'Content-Type', 'application/json'),
          body := jsonb_build_object(
            'from', v_sender_name || ' <noreply@dockercapphotography.com>',
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
