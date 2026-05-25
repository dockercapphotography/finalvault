-- Hearts/favorites per client per image
CREATE TABLE gallery_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  image_id   UUID NOT NULL REFERENCES gallery_images(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL REFERENCES gallery_viewers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (image_id, viewer_id)
);
