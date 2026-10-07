-- 087_review_image_access.sql
-- v1.5.17: lets the R2 worker serve a session's gallery photos (cover +
-- live previews) to /review/:token visitors, and nothing else.
--
-- Called by r2-worker/src/middleware/reviewImageAccess.js through
-- PostgREST with the service key -- one round-trip per image instead of
-- the 3-4 chained REST lookups (request -> session -> gallery -> image)
-- the other access middlewares would need for this shape.
--
-- Returns the owning photographer's id when ALL of these hold, else NULL:
--   * the token belongs to an existing review request
--   * the photographer still has premium access
--   * the request's session has an ACTIVE gallery
--   * the key is that gallery's cover_r2_key, or the preview_r2_key of a
--     non-deleted image in it
--
-- Unlike the microsite/booking-cover modes, this is gated by a secret
-- (the review token), so the worker serves these responses as private.
--
-- Not callable by anon/authenticated -- service role only.
--
-- Run after: 086_client_reviews.sql

CREATE OR REPLACE FUNCTION public.review_image_access(p_token text, p_key text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.photographer_id
  FROM testimonial_requests r
  JOIN sessions s ON s.id = r.session_id
  JOIN galleries g ON g.id = s.gallery_id AND g.is_active = true
  WHERE r.token = p_token
    AND photographer_has_premium_access(r.photographer_id)
    AND (
      g.cover_r2_key = p_key
      OR EXISTS (
        SELECT 1 FROM gallery_images gi
        WHERE gi.gallery_id = g.id
          AND gi.deleted_at IS NULL
          AND gi.preview_r2_key = p_key
      )
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.review_image_access(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_image_access(text, text) TO service_role;
