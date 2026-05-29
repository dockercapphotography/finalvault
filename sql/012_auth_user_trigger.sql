-- ============================================
-- Auth User Trigger + Default Seeding
-- ============================================
-- Creates a photographers row when a new user signs up,
-- then seeds default gallery templates and email templates.

-- 1. Function to create photographer row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.photographers (id, display_name)
  VALUES (
    NEW.id,
    TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', ''))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 3. Function to seed default gallery + email templates for new photographers
DROP TRIGGER IF EXISTS on_photographer_created_seed_templates ON photographers;

CREATE OR REPLACE FUNCTION seed_default_gallery_templates()
RETURNS TRIGGER AS $$
BEGIN
  -- Gallery templates
  INSERT INTO gallery_templates (
    photographer_id, name, theme_color, grid_size, grid_spacing, sets,
    allow_downloads, download_watermarked, allow_hires_download,
    allow_favorites, allow_comments, is_builtin, sort_order
  ) VALUES
    (NEW.id, 'Classic Light', 'light', 'medium', 'tight',
     '["Previews", "Edited - Proofs", "Edited - Final Delivery"]'::jsonb,
     true, false, false, true, true, true, 0),
    (NEW.id, 'Classic Dark', 'dark', 'medium', 'tight',
     '["Previews", "Edited - Proofs", "Edited - Final Delivery"]'::jsonb,
     true, false, false, true, true, true, 1);

  -- Email templates
  INSERT INTO email_templates (photographer_id, name, subject, body)
  VALUES
    (NEW.id, 'Final Delivery',
     'Your photos are ready — {{gallery_name}}',
     'Your final gallery is ready. It has been a pleasure working with you and I hope these images bring back all the best memories from our session. You can download your images directly from the gallery.'),
    (NEW.id, 'Follow-up / Reminder',
     'Reminder — your gallery is waiting',
     'Just a friendly reminder that your gallery is still up and ready for you. Your gallery expires on {{expiry_date}}, so please make sure you have downloaded everything you want to keep before then. Let me know if you have any trouble getting in.'),
    (NEW.id, 'Gallery Expiring Soon',
     'Your gallery expires soon — {{gallery_name}}',
     'I wanted to give you a heads up that your gallery expires on {{expiry_date}}. Please make sure you have downloaded all the images you want to keep before it is taken down. If you need a little more time, just reach out and I will see what I can do.'),
    (NEW.id, 'Large Group / Event',
     'Your photos from {{gallery_name}} are available',
     'Thank you for being part of {{gallery_name}}. Your photos are now available to view and download. If you have any trouble accessing your images, feel free to reach out.'),
    (NEW.id, 'Preview Delivery',
     'Your preview gallery is ready — {{gallery_name}}',
     'I''ve put together a selection of my favorites from our session for you to look through. Take your time browsing and use the heart icon to mark the images you love most — your favorites help me prioritize as I work through the rest of your gallery.'),
    (NEW.id, 'Thank You',
     'Thank you, {{client_name}}',
     'I just wanted to take a moment to say thank you for choosing {{business_name}}. It was a genuine pleasure working with you and I am so excited to share the results. I am hard at work on your images and will be in touch as soon as your gallery is ready. Do not hesitate to reach out if you have any questions.');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'seed_default_gallery_templates error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger on photographers
CREATE TRIGGER on_photographer_created_seed_templates
  AFTER INSERT ON photographers
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_gallery_templates();
