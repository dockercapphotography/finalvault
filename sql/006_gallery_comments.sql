-- Comments on images or gallery overall
CREATE TABLE gallery_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id        UUID REFERENCES gallery_images(id) ON DELETE CASCADE,  -- NULL = gallery-level
  viewer_id       UUID REFERENCES gallery_viewers(id) ON DELETE SET NULL,
  photographer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT comment_has_author CHECK (
    (viewer_id IS NOT NULL AND photographer_id IS NULL) OR
    (viewer_id IS NULL AND photographer_id IS NOT NULL)
  )
);
