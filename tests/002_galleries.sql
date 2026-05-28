-- Galleries — one per shoot/event/client
CREATE TABLE galleries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  client_name          TEXT,
  notes                TEXT,
  event_date           DATE,
  template             TEXT DEFAULT 'classic' CHECK (template IN ('classic', 'minimal', 'editorial', 'bold')),
  cover_image_id       UUID,
  password_hash        TEXT,
  download_pin_hash    TEXT,
  allow_downloads      BOOLEAN DEFAULT true,
  download_watermarked BOOLEAN DEFAULT false,
  allow_favorites      BOOLEAN DEFAULT true,
  allow_comments       BOOLEAN DEFAULT true,
  require_password     BOOLEAN DEFAULT false,
  require_download_pin BOOLEAN DEFAULT false,
  expires_at           TIMESTAMPTZ,
  is_active            BOOLEAN DEFAULT true,
  share_token          TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
