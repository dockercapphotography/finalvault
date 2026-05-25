-- Individual images within a gallery
CREATE TABLE gallery_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_r2_key TEXT NOT NULL,
  preview_r2_key  TEXT NOT NULL,
  file_name       TEXT,
  file_size       BIGINT,
  file_type       TEXT,  -- 'image/jpeg', 'image/png', 'image/raw', etc.
  width           INT,
  height          INT,
  sort_order      INT DEFAULT 0,
  uploaded_at     TIMESTAMPTZ DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Add cover_image FK now that gallery_images exists
ALTER TABLE galleries
  ADD CONSTRAINT fk_cover_image
  FOREIGN KEY (cover_image_id) REFERENCES gallery_images(id) ON DELETE SET NULL;
