-- Migration: 019_notification_preferences.sql
-- Feature: Per-event push notification preferences, plus wiring
-- questionnaire responses and contract signatures into both the
-- notifications table (in-app bell, always populated regardless of push
-- preference) and push (gated by preference, default varies by event).
--
-- Defaults: claim / contract_signed / questionnaire_response default ON
-- (matches how claim push already behaved before preferences existed --
-- this migration doesn't change anyone's existing experience unless they
-- explicitly turn something off). comment / favorite / download default
-- OFF and are columns only -- no trigger wires into them yet, reserved
-- for when that infrastructure gets built, so this doesn't need another
-- migration just to add the column later.
--
-- Run after: 018_notifications.sql

CREATE TABLE IF NOT EXISTS notification_preferences (
  photographer_id uuid PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
  claim boolean NOT NULL DEFAULT true,
  contract_signed boolean NOT NULL DEFAULT true,
  questionnaire_response boolean NOT NULL DEFAULT true,
  comment boolean NOT NULL DEFAULT false,
  favorite boolean NOT NULL DEFAULT false,
  download boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view their own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = photographer_id);

-- Both INSERT and UPDATE policies: a row is created lazily the first time a
-- photographer changes any toggle away from its default (via upsert on
-- photographer_id), rather than being provisioned upfront for every
-- photographer. No row at all means "use the defaults above" -- every read
-- site (trigger functions, the frontend) already treats a missing row the
-- same as all-defaults, so this is safe.
CREATE POLICY "Photographers can create their own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = photographer_id);

CREATE POLICY "Photographers can update their own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = photographer_id)
  WITH CHECK (auth.uid() = photographer_id);

-- Extends notify_claim_push() (already modified once in 018_notifications.sql
-- to also insert into `notifications`) to additionally respect the `claim`
-- preference before sending push specifically. The notifications insert
-- stays unconditional -- preferences only gate the push channel, never
-- whether something shows up in the in-app bell.
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
      from notification_preferences
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

-- New: questionnaire responses. Unlike claims, submissions come from a
-- direct client-side insert (SubmitForm.jsx -> session_submissions), not
-- through an Edge Function -- so this needs its own DB trigger, same shape
-- as the claim one, with its own distinctly-named secret
-- (questionnaire_push_secret, set up separately -- see deployment notes).
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
  from notification_preferences
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

DROP TRIGGER IF EXISTS trg_notify_questionnaire_push ON session_submissions;
CREATE TRIGGER trg_notify_questionnaire_push
  AFTER INSERT ON session_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_questionnaire_push();

-- Note: contract-signed does NOT get a DB trigger -- it already flows
-- through the sign-contract Edge Function (see supabase/functions/
-- sign-contract/index.ts), so the notifications insert + preference-gated
-- push send happen inline there instead, right alongside its existing
-- email send. No new secret needed for that path since it's not invoked
-- via pg_net.
