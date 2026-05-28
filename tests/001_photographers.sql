-- Photographer profiles extending Supabase auth
CREATE TABLE photographers (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT,
  logo_r2_key          TEXT,
  watermark_r2_key     TEXT,
  watermark_opacity    FLOAT DEFAULT 0.3 CHECK (watermark_opacity >= 0 AND watermark_opacity <= 1),
  watermark_position   TEXT DEFAULT 'bottom-right' CHECK (watermark_position IN ('center','top-left','top-right','bottom-left','bottom-right')),
  accent_color         TEXT DEFAULT '#ffffff',
  is_admin             BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
