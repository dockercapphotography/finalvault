-- Allow photographers to update their own images (needed for sort_order)
CREATE POLICY "Photographers can update own images"
  ON gallery_images FOR UPDATE USING (auth.uid() = photographer_id);

CREATE POLICY "Photographers can update own images test"
  ON test.gallery_images FOR UPDATE USING (auth.uid() = photographer_id);
