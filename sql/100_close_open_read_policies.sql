-- Migration: 100_close_open_read_policies.sql
-- Security fix, contracts + sessions part 2 (Oct 25, 2026 audit).
--
-- ONLY RUN AFTER the frontend that loads contracts through sql/099's
-- get_contract_by_sign_token is deployed (commit "Load contract signing
-- page through a server-side token check").
--
-- Each policy below is named "... by token" but its condition never checks
-- a token -- it matches EVERY row that has one. They let anyone with the
-- public key (and, for the "to public" ones, any other logged-in
-- photographer) read:
--   contracts                 every unsigned contract, its sign_token
--                             (enough to sign it), body, signer IP/agent
--   sessions                  every session with client details and its
--                             submit_token
--   session_questionnaires,   every session's linked questionnaires and
--   session_galleries         galleries
--   questionnaire_templates,  every photographer's questionnaires
--   questionnaire_questions
--
-- Nothing in the app needs them: every public page reaches this data
-- through SECURITY DEFINER functions (get_submit_form_data,
-- get_signup_page_data, claim_signup_slot, get_client_portal_data,
-- get_review_form_data, get_contract_by_sign_token, ...), which bypass RLS,
-- and photographers read their own rows through each table's existing
-- "photographers manage own ..." policy, which stays.
--
-- ROLLBACK (recreates the six policies exactly as they were):
--   CREATE POLICY "Public can view contract by sign token" ON public.contracts FOR SELECT TO anon USING ((sign_token IS NOT NULL) AND (status = ANY (ARRAY['sent'::text, 'pending_photographer'::text])));
--   CREATE POLICY "public can read session by submit token" ON public.sessions FOR SELECT TO public USING (submit_token IS NOT NULL);
--   CREATE POLICY "public can read session questionnaires by token" ON public.session_questionnaires FOR SELECT TO public USING (session_id IN (SELECT sessions.id FROM sessions WHERE sessions.submit_token IS NOT NULL));
--   CREATE POLICY "public can read session galleries by token" ON public.session_galleries FOR SELECT TO public USING (session_id IN (SELECT sessions.id FROM sessions WHERE sessions.submit_token IS NOT NULL));
--   CREATE POLICY "public can read questionnaire templates by session token" ON public.questionnaire_templates FOR SELECT TO public USING (true);
--   CREATE POLICY "public can read questionnaire questions by session token" ON public.questionnaire_questions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public can view contract by sign token" ON public.contracts;
DROP POLICY IF EXISTS "public can read session by submit token" ON public.sessions;
DROP POLICY IF EXISTS "public can read session questionnaires by token" ON public.session_questionnaires;
DROP POLICY IF EXISTS "public can read session galleries by token" ON public.session_galleries;
DROP POLICY IF EXISTS "public can read questionnaire templates by session token" ON public.questionnaire_templates;
DROP POLICY IF EXISTS "public can read questionnaire questions by session token" ON public.questionnaire_questions;
