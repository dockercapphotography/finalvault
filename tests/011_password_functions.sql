-- Password verification RPC function
-- Used by the validate-gallery-access Edge Function to verify
-- gallery passwords and download PINs without exposing hashes to the client.
-- Requires pgcrypto extension (enabled by default on Supabase).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify a bcrypt-hashed password
CREATE OR REPLACE FUNCTION verify_gallery_password(p_hash TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN p_hash = crypt(p_password, p_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Hash a password for storage (called when setting gallery password or PIN)
CREATE OR REPLACE FUNCTION hash_gallery_password(p_password TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(p_password, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION verify_gallery_password(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION hash_gallery_password(TEXT) TO authenticated;
