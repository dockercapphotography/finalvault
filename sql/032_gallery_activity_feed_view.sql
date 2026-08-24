-- Migration: 032_gallery_activity_feed_view.sql
-- Feature: paginated Gallery Activity feed (reusable pagination refactor)
--
-- GalleryActivity.jsx previously fetched gallery_activity_log AND
-- gallery_comments (photographer replies) separately, capped each at
-- .limit(200), merged + sorted them in JS, and never paginated past that
-- -- older activity just silently vanished past 200 combined rows, with
-- no indication anything was cut off.
--
-- This view unions both sources into one orderable, paginatable
-- resource so the page can use real .range() + count('exact') pagination
-- instead. Photographer replies get a synthetic 'reply-' + id prefix on
-- their id (matching the client-side prefix the old code already used)
-- to avoid colliding with real gallery_activity_log ids, since both
-- source tables use their own independent UUID sequences.
--
-- SECURITY: `security_invoker = true` is deliberate and load-bearing --
-- without it, a view defined by a privileged role (the migration is run
-- as postgres/service role in the SQL Editor) would by default check
-- THAT role's permissions for the underlying tables, not the querying
-- photographer's, silently bypassing whatever RLS already protects
-- gallery_activity_log/gallery_comments. Neither table's photographer-
-- facing SELECT policy exists in any tracked migration in this repo --
-- per this project's own documented pattern, the live DB is the source
-- of truth and this policy was applied directly, not tracked here.
-- security_invoker=true sidesteps needing to know or replicate that
-- policy's exact logic: the view simply inherits whatever RLS the two
-- base tables already enforce for the querying user, live, whatever
-- that turns out to be.
--
-- Column shape is deliberately FLAT (viewer_email/viewer_display_name/
-- image_file_name/image_preview_r2_key as plain columns, not nested
-- PostgREST resource embeds) since embedding doesn't work the same way
-- against a UNION'd view as it does against a real FK relationship --
-- the frontend re-nests these into the same {gallery_viewers,
-- gallery_images} shape the existing render code already expects.

CREATE VIEW gallery_activity_feed
WITH (security_invoker = true) AS
SELECT
  'log-' || l.id::text AS id,
  l.gallery_id,
  l.action,
  l.occurred_at,
  l.image_id,
  l.viewer_id,
  l.metadata,
  gv.email AS viewer_email,
  gv.display_name AS viewer_display_name,
  gi.file_name AS image_file_name,
  gi.preview_r2_key AS image_preview_r2_key,
  NULL::text AS comment_body
FROM gallery_activity_log l
LEFT JOIN gallery_viewers gv ON gv.id = l.viewer_id
LEFT JOIN gallery_images gi ON gi.id = l.image_id

UNION ALL

SELECT
  'reply-' || c.id::text AS id,
  c.gallery_id,
  'reply'::text AS action,
  c.created_at AS occurred_at,
  c.image_id,
  NULL::uuid AS viewer_id,
  NULL::jsonb AS metadata,
  NULL::text AS viewer_email,
  NULL::text AS viewer_display_name,
  gi2.file_name AS image_file_name,
  gi2.preview_r2_key AS image_preview_r2_key,
  c.body AS comment_body
FROM gallery_comments c
LEFT JOIN gallery_images gi2 ON gi2.id = c.image_id
WHERE c.photographer_id IS NOT NULL AND c.deleted_at IS NULL;
