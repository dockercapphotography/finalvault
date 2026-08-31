-- 052_signup_page_token_rpc.sql
-- The preview's client-side token resolution was failing silently --
-- confirmed via debug logging: {data: null, error: null}, the exact
-- signature of RLS filtering out a row rather than an actual query
-- error. signup_pages has no policy permitting anonymous SELECT.
-- Rather than a broad RLS policy exposing the whole table publicly,
-- adds a small SECURITY DEFINER RPC matching the same pattern already
-- used elsewhere (get_site_by_hostname, get_signup_page_data) --
-- exposes exactly the one field needed (token), nothing else.
--
-- Run after: 051_booking_signup_page_link.sql

CREATE OR REPLACE FUNCTION get_signup_page_token(p_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT token FROM signup_pages WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION get_signup_page_token(uuid) TO anon;
