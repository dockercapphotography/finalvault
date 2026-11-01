-- 120_booking_invoices.sql
-- v1.6.0 step 11: bookings create a draft invoice.
--
-- claim_signup_slot (sign-up slots) and submit_signup_inquiry (booking
-- inquiries) used to copy the shoot type's price and retainer into the old
-- session fee fields, which nothing reads any more. Now each new booked
-- session also gets a DRAFT invoice the photographer reviews and sends:
--
--   * shoot type linked to an invoice template (new optional column
--     signup_shoot_types.invoice_template_id): the template's lines (as
--     resolved against the catalog today), tax, discount, notes and payment
--     schedule, with due dates from its rules (session date = the booked date)
--   * otherwise, a price set: one line "<shoot type> " at that price; with a
--     retainer smaller than the price, two installments -- retainer due the
--     day it's booked, the rest due on the session date
--   * otherwise (no price, no template): no invoice
--
-- The payment platform is the photographer's default. A failure here is
-- logged as a warning and never stops the booking itself.
--
-- The two booking functions below are the live definitions (taken from
-- pg_get_functiondef on Oct 31, 2026) with one addition each, right after
-- the session is inserted. CREATE OR REPLACE keeps their grants and owner.
--
-- Run after: 119_contract_invoice_variables.sql

begin;

-- ── Shoot type -> invoice template ───────────────────────────────────────
alter table public.signup_shoot_types
  add column if not exists invoice_template_id uuid
    references public.invoice_templates(id) on delete set null;

-- ── fv_create_booking_invoice ────────────────────────────────────────────
-- Internal: only called from the booking functions (which run as the
-- owner). Not executable by API roles.
create or replace function public.fv_create_booking_invoice(p_session_id uuid, p_shoot_type_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_session   sessions%rowtype;
  v_type      signup_shoot_types%rowtype;
  v_template  invoice_templates%rowtype;
  v_platform  text;
  v_invoice   uuid;
  v_total     numeric(12,2);
  v_cents     bigint;
  v_assigned  bigint := 0;
  v_amount    bigint;
  v_rows      integer;
  v_i         integer := 0;
  v_due       date;
  r           record;
begin
  select * into v_session from sessions where id = p_session_id;
  select * into v_type from signup_shoot_types where id = p_shoot_type_id;
  if v_session.id is null or v_type.id is null or v_session.client_id is null then
    return null;
  end if;
  if exists (select 1 from invoices where session_id = p_session_id) then
    return null;
  end if;

  -- A template only counts if it belongs to the same photographer.
  if v_type.invoice_template_id is not null then
    select * into v_template from invoice_templates
     where id = v_type.invoice_template_id and photographer_id = v_session.photographer_id;
  end if;

  if v_template.id is null and coalesce(v_type.price, 0) <= 0 then
    return null;
  end if;

  select default_invoice_platform into v_platform from photographers where id = v_session.photographer_id;

  insert into invoices (photographer_id, client_id, session_id, status, payment_platform, tax_rate, discount_rate, notes)
  values (v_session.photographer_id, v_session.client_id, v_session.id, 'draft', v_platform,
          v_template.tax_rate, v_template.discount_rate, v_template.notes)
  returning id into v_invoice;

  if v_template.id is not null then
    insert into invoice_line_items (invoice_id, catalog_item_id, title, description, quantity, unit_price, unit_label, taxable, sort_order)
    select v_invoice, ri.catalog_item_id, ri.title, ri.description, ri.quantity, coalesce(ri.unit_price, 0), ri.unit_label, ri.taxable, ri.sort_order
      from invoice_template_items_resolved ri
     where ri.template_id = v_template.id and nullif(btrim(coalesce(ri.title, '')), '') is not null
     order by ri.sort_order;

    select total into v_total from invoice_totals where invoice_id = v_invoice;
    v_cents := round(coalesce(v_total, 0) * 100);
    select count(*) into v_rows from invoice_template_schedule where template_id = v_template.id;

    -- Same split as the app (invoiceApi.patternAmounts): each row rounds
    -- its percentage, the last row takes what's left.
    if v_rows > 0 and v_cents > 0 then
      for r in select * from invoice_template_schedule where template_id = v_template.id order by sequence loop
        v_i := v_i + 1;
        v_amount := case when v_i = v_rows then v_cents - v_assigned else round(v_cents * r.percent / 100) end;
        v_assigned := v_assigned + v_amount;
        v_due := case r.due_rule
          when 'after_create'   then current_date + r.due_days
          when 'before_session' then v_session.session_date - r.due_days
          when 'on_session'     then v_session.session_date
          else current_date end;
        if v_amount <= 0 then
          raise exception 'Template schedule leaves an installment at zero';
        end if;
        insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date)
        values (v_invoice, v_i, v_amount / 100.0, v_due);
      end loop;
    end if;
  else
    insert into invoice_line_items (invoice_id, title, quantity, unit_price, taxable, sort_order)
    values (v_invoice, v_type.name, 1, v_type.price, false, 0);

    if coalesce(v_type.retainer_amount, 0) > 0 and v_type.retainer_amount < v_type.price then
      insert into invoice_payment_schedule (invoice_id, sequence, amount, due_date) values
        (v_invoice, 1, v_type.retainer_amount, current_date),
        (v_invoice, 2, v_type.price - v_type.retainer_amount, v_session.session_date);
    end if;
  end if;

  return v_invoice;
end $$;

revoke all on function public.fv_create_booking_invoice(uuid, uuid) from public, anon, authenticated;

-- ── claim_signup_slot (live definition + the booking invoice call) ──
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

  -- v1.6.0 (120): draft invoice from the shoot type's template or price.
  BEGIN
    PERFORM fv_create_booking_invoice(v_session_id, v_shoot_type.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create the booking invoice: %', SQLERRM;
  END;

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

-- ── submit_signup_inquiry (live definition + the booking invoice call) ──
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

  -- v1.6.0 (120): draft invoice from the shoot type's template or price.
  BEGIN
    PERFORM fv_create_booking_invoice(v_session_id, v_shoot_type.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create the booking invoice: %', SQLERRM;
  END;

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

commit;

-- Rollback: re-run the two function definitions from before this migration
-- (the same functions without the "v1.6.0 (120)" block), then:
-- drop function if exists public.fv_create_booking_invoice(uuid, uuid);
-- alter table public.signup_shoot_types drop column if exists invoice_template_id;
