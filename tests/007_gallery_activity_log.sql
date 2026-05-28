-- Audit trail for photographer dashboard
CREATE TABLE gallery_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  viewer_id   UUID REFERENCES gallery_viewers(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (action IN (
    'view', 'favorite', 'unfavorite', 'comment',
    'download_single', 'download_all'
  )),
  image_id    UUID REFERENCES gallery_images(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ DEFAULT now()
);
