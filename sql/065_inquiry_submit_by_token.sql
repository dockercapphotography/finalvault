-- 065_inquiry_submit_by_token.sql
-- Follow-up to 064 -- submit_signup_inquiry now takes the page's public
-- token instead of its raw signup_pages.id. get_signup_page_data never
-- exposes that internal id to the public booking page, and there's no
-- other reason to add it just for this one call. Looks the page up by
-- token internally, same pattern get_signup_page_data itself already
-- uses.
--
-- Run after: 064_inquiry_signup_pages.sql
-- Run this whole file in the Supabase SQL editor.

DROP FUNCTION IF EXISTS public.submit_signup_inquiry(uuid, uuid, date, time, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_signup_inquiry(
  p_token text,
  p_shoot_type_id uuid,
  p_date date,
  p_time time,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_pronouns text DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_page signup_pages;
  v_shoot_type signup_shoot_types;
  v_window signup_inquiry_windows;
  v_end_time time;
  v_client_id uuid;
  v_session_id uuid;
BEGIN
  SELECT * INTO v_page FROM signup_pages WHERE token = p_token;
  IF v_page IS NULL OR NOT v_page.is_active OR v_page.mode <> 'inquiry' THEN
    RETURN json_build_object('success', false, 'error', 'page_not_available');
  END IF;

  SELECT * INTO v_shoot_type FROM signup_shoot_types
  WHERE id = p_shoot_type_id AND signup_page_id = v_page.id;
  IF v_shoot_type IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'shoot_type_not_found');
  END IF;

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

  SELECT id INTO v_client_id
  FROM clients
  WHERE photographer_id = v_page.photographer_id
    AND lower(email) = lower(p_email)
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO clients (photographer_id, first_name, last_name, email, phone, pronouns)
    VALUES (v_page.photographer_id, p_first_name, p_last_name, p_email, p_phone, p_pronouns)
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO sessions (
    photographer_id, client_id, name, type, mode, status,
    session_date, start_time, end_time, location, submit_token
  ) VALUES (
    v_page.photographer_id, v_client_id,
    v_shoot_type.name || ' inquiry', v_shoot_type.session_type, 'private', 'inquiry',
    p_date, p_time, v_end_time, v_page.venue_address,
    replace(gen_random_uuid()::text, '-', '')
  )
  RETURNING id INTO v_session_id;

  INSERT INTO session_questionnaires (session_id, questionnaire_id, sort_order)
  SELECT v_session_id, stq.questionnaire_id, stq.sort_order
  FROM signup_shoot_type_questionnaires stq
  WHERE stq.shoot_type_id = p_shoot_type_id;

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

GRANT EXECUTE ON FUNCTION submit_signup_inquiry(text, uuid, date, time, text, text, text, text, text) TO anon;
