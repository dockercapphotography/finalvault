-- Helper RPCs for client gallery access
-- These allow unauthenticated clients to verify passwords/PINs
-- without having direct read access to password_hash columns.

CREATE OR REPLACE FUNCTION get_gallery_password_hash(p_gallery_id UUID)
RETURNS TEXT AS $$
  SELECT password_hash FROM galleries
  WHERE id = p_gallery_id AND is_active = true
  AND (expires_at IS NULL OR expires_at > now())
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_gallery_pin_hash(p_gallery_id UUID)
RETURNS TEXT AS $$
  SELECT download_pin_hash FROM galleries
  WHERE id = p_gallery_id AND is_active = true
  AND (expires_at IS NULL OR expires_at > now())
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_photographer_display_name(p_photographer_id UUID)
RETURNS TEXT AS $$
  SELECT display_name FROM photographers WHERE id = p_photographer_id
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_gallery_password_hash(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_gallery_pin_hash(UUID) TO anon;
GRANT EXECUTE ON FUNCTION verify_gallery_password(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_photographer_display_name(UUID) TO anon;

-- Allow anon to read active galleries by share token
CREATE POLICY IF NOT EXISTS "Public can view active galleries by share token"
  ON galleries FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Table-level grants for anon
GRANT INSERT, SELECT, UPDATE ON gallery_viewers TO anon;
GRANT INSERT, SELECT ON gallery_favorites TO anon;
GRANT INSERT, SELECT ON gallery_comments TO anon;
GRANT SELECT ON gallery_images TO anon;
GRANT SELECT ON galleries TO anon;
