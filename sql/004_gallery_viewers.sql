-- Client session tracking (no account needed)
CREATE TABLE gallery_viewers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id   UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  session_id   TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now()
);
