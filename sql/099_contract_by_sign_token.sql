-- Migration: 099_contract_by_sign_token.sql
-- Security fix, contracts part 1 of 2 (Oct 25, 2026 audit). Safe to run on
-- its own: it only ADDS a function; nothing existing changes until 100.
--
-- The problem: the anon policy "Public can view contract by sign token"
-- only checks that a sign_token exists and the status is sent /
-- pending_photographer -- it never checks the caller has THAT token. So
-- anyone with the public key could list every unsigned contract, including
-- its sign_token (enough to sign it through the sign-contract function),
-- body, signer IP and user agent.
--
-- get_contract_by_sign_token returns exactly what SignContract.jsx shows,
-- for the one contract matching the token, with the same status rule the
-- policy had. Its JSON shape matches the old embedded select
-- (photographers { display_name, business_name }) so the page is unchanged.
-- clients is returned as null on purpose: anon never could read clients
-- (no anon policy), so the page has always shown no client name here.

CREATE OR REPLACE FUNCTION public.get_contract_by_sign_token(p_token text)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', c.id,
    'title', c.title,
    'body', c.body,
    'body_hash', c.body_hash,
    'status', c.status,
    'signed_at', c.signed_at,
    'signed_name', c.signed_name,
    'clients', NULL,
    'photographers', (
      SELECT json_build_object('display_name', p.display_name, 'business_name', p.business_name)
      FROM photographers p
      WHERE p.id = c.photographer_id
    )
  )
  FROM contracts c
  WHERE c.sign_token = p_token
    AND c.status IN ('sent', 'pending_photographer')
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_contract_by_sign_token(text) TO anon, authenticated;
