-- Enable RLS on all tables
ALTER TABLE photographers ENABLE ROW LEVEL SECURITY;
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE photographer_storage ENABLE ROW LEVEL SECURITY;

-- Photographers: own row only
CREATE POLICY "Photographers can read own profile"
  ON photographers FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Photographers can update own profile"
  ON photographers FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Photographers can insert own profile"
  ON photographers FOR INSERT WITH CHECK (auth.uid() = id);

-- Galleries: photographer owns their galleries
CREATE POLICY "Photographers can manage own galleries"
  ON galleries FOR ALL USING (auth.uid() = photographer_id);

-- Gallery images: photographer owns their images
CREATE POLICY "Photographers can manage own images"
  ON gallery_images FOR ALL USING (auth.uid() = photographer_id);

-- Storage tiers: anyone can read (needed for client-side display)
CREATE POLICY "Anyone can read storage tiers"
  ON storage_tiers FOR SELECT USING (true);

-- Photographer storage: own row only
CREATE POLICY "Photographers can read own storage"
  ON photographer_storage FOR SELECT USING (auth.uid() = photographer_id);

-- NOTE: Client-facing access (gallery_viewers, favorites, comments, activity_log)
-- is handled via Supabase Edge Functions with share token validation,
-- not direct RLS policies, to avoid exposing data to unauthenticated users.
