-- 090_default_review_request_templates.sql
-- v1.5.17: three starter Review Request Templates for every photographer,
-- the same way gallery and email templates are seeded (012): each
-- photographer gets their own editable, deletable copies -- not shared
-- rows -- so editing one never affects anyone else.
--
--   After-session thank you  (marked as the default)
--   Convention follow-up
--   Friendly reminder
--
-- 1. seed_default_review_request_templates(photographer_id) -- inserts
--    the three only if that photographer has NO review request templates
--    yet, so it never duplicates and never resurrects ones a
--    photographer deleted after the first seed... except on a re-run of
--    this file for someone who has since deleted all three (acceptable;
--    this file is run once).
-- 2. A NEW trigger on photographers for new signups. Deliberately a
--    separate trigger/function rather than an edit to
--    seed_default_gallery_templates(), so the live definition of that
--    function (which may have drifted from 012) is left untouched.
-- 3. Backfill for every existing photographer.
--
-- Run after: 089_review_session_galleries.sql

-- ── 1. Seeder ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_default_review_request_templates(p_photographer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM review_request_templates WHERE photographer_id = p_photographer_id) THEN
    RETURN;
  END IF;

  INSERT INTO review_request_templates (photographer_id, name, subject, body, is_default)
  VALUES
    (p_photographer_id,
     'After-session thank you',
     'How was your session, {{client_first_name}}?',
     E'Hi {{client_first_name}},\n\nThank you again for choosing {{studio_name}} for your {{session_type}} session. I had a great time working with you, and I hope you''re loving your photos!\n\nIf you have a minute, I''d really appreciate hearing how it went. A few sentences is plenty, and it helps other people decide if I''m the right fit for them.\n\nThank you!\n{{photographer_name}}',
     true),
    (p_photographer_id,
     'Convention follow-up',
     'Loved shooting with you at {{session_name}}!',
     E'Hi {{client_first_name}},\n\nThanks for booking a shoot with me at {{session_name}}. Your cosplay was amazing, and it was a blast bringing it to life on camera.\n\nWould you share a quick review of your experience? It helps other cosplayers find me at the next con, and I''d love to feature yours on my website.\n\nSee you at the next one!\n{{photographer_name}}\n{{studio_name}}',
     false),
    (p_photographer_id,
     'Friendly reminder',
     'Quick favor, {{client_first_name}}?',
     E'Hi {{client_first_name}},\n\nJust a gentle nudge in case my last email got buried. If you have a moment, I''d love to hear about your {{session_type}} session. It only takes a minute.\n\nNo pressure at all, and thank you either way!\n{{photographer_name}}',
     false);
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_default_review_request_templates(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. New signups ───────────────────────────────────────────────────
-- Same failure handling as seed_default_gallery_templates(): a seeding
-- error is logged and never blocks account creation.

CREATE OR REPLACE FUNCTION public.seed_review_request_templates_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM seed_default_review_request_templates(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'seed_review_request_templates_on_signup error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_photographer_created_seed_review_templates ON photographers;
CREATE TRIGGER on_photographer_created_seed_review_templates
  AFTER INSERT ON photographers
  FOR EACH ROW
  EXECUTE FUNCTION seed_review_request_templates_on_signup();

-- ── 3. Existing photographers ────────────────────────────────────────

SELECT seed_default_review_request_templates(p.id) FROM photographers p;
