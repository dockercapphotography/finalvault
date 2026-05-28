-- Watermarks — one or more per photographer, one active at a time
CREATE TABLE watermarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label            TEXT NOT NULL DEFAULT 'My Watermark',
  r2_key           TEXT NOT NULL,
  opacity          FLOAT NOT NULL DEFAULT 0.3 CHECK (opacity >= 0 AND opacity <= 1),
  position         TEXT NOT NULL DEFAULT 'bottom-right'
                     CHECK (position IN ('center','top-left','top-right','bottom-left','bottom-right')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Active watermark pointer on photographers
ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS active_watermark_id UUID REFERENCES watermarks(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE watermarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photographers manage own watermarks"
  ON watermarks FOR ALL
  USING (photographer_id = auth.uid())
  WITH CHECK (photographer_id = auth.uid());

-- Updated-at trigger
CREATE TRIGGER watermarks_updated_at
  BEFORE UPDATE ON watermarks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
