-- Migration: 018_notifications.sql
-- Feature: Generic in-app notifications table -- the missing "real event,
-- needs attention now" source for the NotificationBell, sitting alongside
-- (not replacing) the existing gallery-activity-log and pending-contracts
-- sources, which are a different shape of thing (a browsing history and a
-- self-clearing state query, respectively) and don't need to move here.
--
-- Starts with signup slot claims as the first event type, by extending the
-- existing notify_claim_push() trigger function to also insert a row here,
-- in the same transaction as the push send -- one fan-out point for both
-- channels. Future event types (contract signed, questionnaire response)
-- follow the same pattern: their own trigger/Edge Function inserts here too.
--
-- Run after: 017_signup_slots_photographer_note.sql

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_photographer_created_idx
  ON notifications (photographer_id, created_at DESC);

-- Partial index for unread lookups specifically -- kept for future features
-- (e.g. per-item mark-as-read) even though the bell's badge count currently
-- works off photographers.notifications_last_read_at, same as its other
-- two sources, rather than this column.
CREATE INDEX IF NOT EXISTS notifications_photographer_unread_idx
  ON notifications (photographer_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = photographer_id);

CREATE POLICY "Photographers can mark their own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = photographer_id)
  WITH CHECK (auth.uid() = photographer_id);

-- Deliberately no INSERT policy for the authenticated role -- every row is
-- written server-side via a SECURITY DEFINER trigger function (which
-- bypasses RLS entirely), never directly by a photographer's own client.
-- That's what keeps this trustworthy as a real event log rather than
-- something a client could fake.

-- Lets the frontend subscribe to new rows via Supabase Realtime. Safe to
-- run once; re-running if the table's already in the publication will
-- error ("already member of publication") -- just skip this line if so.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Extends the existing claim-push trigger function (live definition
-- confirmed before writing this) to also insert a notification row,
-- alongside its existing pg_net push call -- same transaction, same event,
-- one fan-out point for both channels.
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
begin
  if new.claimed_at is not null and old.claimed_at is null then
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
    end if;
  end if;
  return new;
end;
$function$;
