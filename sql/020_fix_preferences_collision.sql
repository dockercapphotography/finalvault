-- Migration: 020_fix_preferences_collision.sql
-- Fixes a naming collision from 019_notification_preferences.sql: a table
-- called `notification_preferences` already existed (the Activity Digest
-- email feature's favorites/comments/downloads/selections toggles --
-- see Account.jsx and send-activity-digest/index.ts, both untouched by
-- this fix). 019's `CREATE TABLE IF NOT EXISTS` silently no-op'd against
-- that existing table instead of creating the new push-preferences one,
-- and the trigger functions it defined were left selecting columns
-- (`claim`, `contract_signed`, `questionnaire_response`) that don't exist
-- on the real table -- which would throw and roll back the entire
-- transaction on every slot claim and questionnaire submission until
-- this is applied.
--
-- This creates the correctly-named `push_notification_preferences` table
-- and repoints both trigger functions at it. The original
-- notification_preferences table (digest settings) is completely
-- untouched -- nothing was ever written to or read from it by 019, since
-- the CREATE TABLE never actually ran.
--
-- Run after: 019_notification_preferences.sql

CREATE TABLE IF NOT EXISTS push_notification_preferences (
  photographer_id uuid PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
  claim boolean NOT NULL DEFAULT true,
  contract_signed boolean NOT NULL DEFAULT true,
  questionnaire_response boolean NOT NULL DEFAULT true,
  comment boolean NOT NULL DEFAULT false,
  favorite boolean NOT NULL DEFAULT false,
  download boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers can view their own push preferences" ON push_notification_preferences;
CREATE POLICY "Photographers can view their own push preferences"
  ON push_notification_preferences FOR SELECT
  USING (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "Photographers can create their own push preferences" ON push_notification_preferences;
CREATE POLICY "Photographers can create their own push preferences"
  ON push_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = photographer_id);

DROP POLICY IF EXISTS "Photographers can update their own push preferences" ON push_notification_preferences;
CREATE POLICY "Photographers can update their own push preferences"
  ON push_notification_preferences FOR UPDATE
  USING (auth.uid() = photographer_id)
  WITH CHECK (auth.uid() = photographer_id);

-- Repoint notify_claim_push() at the correctly-named table. Everything
-- else about this function is identical to the version in
-- 019_notification_preferences.sql.
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

-- Repoint notify_questionnaire_push() at the correctly-named table.
CREATE OR REPLACE FUNCTION public.notify_questionnaire_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
  v_photographer_id uuid;
  v_session_name text;
  v_push_enabled boolean;
begin
  select s.photographer_id, s.name
    into v_photographer_id, v_session_name
  from sessions s
  where s.id = new.session_id;

  if v_photographer_id is null then
    return new;
  end if;

  insert into notifications (photographer_id, type, title, body, url)
  values (
    v_photographer_id,
    'questionnaire_response',
    'New questionnaire response',
    coalesce(new.email, 'Someone') || coalesce(' · ' || v_session_name, ''),
    '/sessions/' || new.session_id
  );

  select questionnaire_response into v_push_enabled
  from push_notification_preferences
  where photographer_id = v_photographer_id;

  if coalesce(v_push_enabled, true) then
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'questionnaire_push_secret';

    perform net.http_post(
      url := 'https://imukbaawmtmctfqchxdx.supabase.co/functions/v1/send-questionnaire-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Questionnaire-Push-Secret', v_secret
      ),
      body := jsonb_build_object('submissionId', new.id)
    );
  end if;

  return new;
end;
$function$;
