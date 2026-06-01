-- Fix: PostgREST cannot resolve `gallery_comments → photographers` embedded
-- selects because the FK on gallery_comments.photographer_id targets
-- auth.users, not public.photographers.
--
-- Re-point the FK at public.photographers(id). That table itself references
-- auth.users(id), so all data integrity is preserved — we're just routing
-- through the public-schema relation that PostgREST can see in its schema
-- cache.
--
-- After this runs, the existing query
--   .select('id, body, ..., gallery_viewers(display_name), photographers(display_name)')
-- on gallery_comments resolves correctly.

BEGIN;

-- Supabase's default constraint name is `<table>_<column>_fkey`. If yours
-- was named manually, swap the constraint name on the next line.
ALTER TABLE public.gallery_comments
    DROP CONSTRAINT IF EXISTS gallery_comments_photographer_id_fkey;

ALTER TABLE public.gallery_comments
    ADD CONSTRAINT gallery_comments_photographer_id_fkey
    FOREIGN KEY (photographer_id)
    REFERENCES public.photographers (id)
    ON DELETE SET NULL;

COMMIT;

-- Tell PostgREST to reload its schema cache so the new FK is picked up
-- without restarting the service.
NOTIFY pgrst, 'reload schema';
