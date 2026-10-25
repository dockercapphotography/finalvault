-- Migration: 101_viewer_rpcs.sql
-- Security fix, gallery viewers part 1 of 2 (Oct 25, 2026 audit). Safe to
-- run on its own: it only ADDS functions; nothing changes until 102.
--
-- The problem: client galleries wrote gallery_viewers, gallery_favorites,
-- gallery_selections, gallery_comments and gallery_activity_log directly
-- as anon, under policies that allow ANY viewer row in ANY active gallery.
-- Anyone with the public key could list every viewer's name and email,
-- edit or delete other viewers' favorites and selections, read other
-- viewers' comments, move viewers between galleries, and insert fake
-- activity (which triggers photographer notifications).
-- get_or_create_gallery_viewer also never checked the gallery was active,
-- and took a gallery id -- which anon can list -- so knowing a client's
-- email was enough to fetch their viewer record.
--
-- After this change, a visitor proves who they are with their own
-- viewer_id (a random UUID only their browser holds -- no longer listable
-- once 102 runs), and every operation goes through a function below that
-- derives the gallery from that viewer and requires it to be active and
-- unexpired. Creating a viewer requires the gallery's share token.

-- Gallery of a viewer, only while that gallery is open to clients.
-- Internal: not callable by anon/authenticated (see REVOKE at the bottom).
CREATE OR REPLACE FUNCTION public.viewer_open_gallery_id(p_viewer_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id
  FROM gallery_viewers v
  JOIN galleries g ON g.id = v.gallery_id
  WHERE v.id = p_viewer_id
    AND g.is_active = true
    AND (g.expires_at IS NULL OR g.expires_at > now())
$$;

-- Same lookup/creation logic as get_or_create_gallery_viewer, but keyed by
-- share token and only for an open gallery.
CREATE OR REPLACE FUNCTION public.get_or_create_gallery_viewer_by_token(
  p_token text, p_email text DEFAULT NULL, p_display_name text DEFAULT NULL)
RETURNS gallery_viewers
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery_id uuid;
  v_viewer gallery_viewers;
  v_normalized_email text := NULLIF(lower(trim(p_email)), '');
BEGIN
  SELECT id INTO v_gallery_id
  FROM galleries
  WHERE share_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  IF v_gallery_id IS NULL THEN
    RAISE EXCEPTION 'Gallery not available';
  END IF;

  IF v_normalized_email IS NOT NULL THEN
    SELECT * INTO v_viewer
    FROM gallery_viewers
    WHERE gallery_id = v_gallery_id
      AND lower(trim(email)) = v_normalized_email
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 1;

    IF v_viewer.id IS NOT NULL THEN
      UPDATE gallery_viewers
      SET last_seen_at = now(),
          display_name = COALESCE(p_display_name, display_name)
      WHERE id = v_viewer.id
      RETURNING * INTO v_viewer;
      RETURN v_viewer;
    END IF;
  END IF;

  INSERT INTO gallery_viewers (gallery_id, session_id, email, display_name)
  VALUES (v_gallery_id, replace(gen_random_uuid()::text, '-', ''), p_email, p_display_name)
  RETURNING * INTO v_viewer;
  RETURN v_viewer;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_gallery_viewer(p_viewer_id uuid)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE gallery_viewers SET last_seen_at = now()
  WHERE id = p_viewer_id AND viewer_open_gallery_id(p_viewer_id) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.get_viewer_favorites(p_viewer_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.image_id
  FROM gallery_favorites f
  WHERE f.viewer_id = p_viewer_id
    AND f.gallery_id = viewer_open_gallery_id(p_viewer_id)
$$;

-- Returns the new state: true = now favorited, false = removed.
CREATE OR REPLACE FUNCTION public.toggle_gallery_favorite(p_viewer_id uuid, p_image_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery_id uuid := viewer_open_gallery_id(p_viewer_id);
  v_removed int;
BEGIN
  IF v_gallery_id IS NULL THEN
    RAISE EXCEPTION 'Gallery not available';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gallery_images
                 WHERE id = p_image_id AND gallery_id = v_gallery_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Image not in this gallery';
  END IF;

  DELETE FROM gallery_favorites WHERE viewer_id = p_viewer_id AND image_id = p_image_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  IF v_removed > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO gallery_favorites (gallery_id, image_id, viewer_id)
  VALUES (v_gallery_id, p_image_id, p_viewer_id)
  ON CONFLICT (image_id, viewer_id) DO NOTHING;
  RETURN true;
END;
$$;

-- Same shape as the old embedded select. A visitor sees the photographer's
-- comments plus their OWN comments only (the old policy let any viewer read
-- every viewer's comments). Without a valid viewer: photographer comments only.
CREATE OR REPLACE FUNCTION public.get_gallery_comments(
  p_gallery_id uuid, p_image_id uuid DEFAULT NULL, p_viewer_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(json_build_object(
           'id', c.id, 'body', c.body, 'created_at', c.created_at, 'image_id', c.image_id,
           'viewer_id', c.viewer_id, 'photographer_id', c.photographer_id,
           'gallery_viewers', CASE WHEN c.viewer_id IS NULL THEN NULL
                                   ELSE json_build_object('display_name', v.display_name, 'email', v.email) END,
           'photographers', CASE WHEN c.photographer_id IS NULL THEN NULL
                                 ELSE json_build_object('display_name', p.display_name) END
         ) ORDER BY c.created_at), '[]'::json)
  FROM gallery_comments c
  JOIN galleries g ON g.id = c.gallery_id
  LEFT JOIN gallery_viewers v ON v.id = c.viewer_id
  LEFT JOIN photographers p ON p.id = c.photographer_id
  WHERE c.gallery_id = p_gallery_id
    AND g.is_active = true
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND c.deleted_at IS NULL
    AND (CASE WHEN p_image_id IS NULL THEN c.image_id IS NULL ELSE c.image_id = p_image_id END)
    AND (c.photographer_id IS NOT NULL
         OR (p_viewer_id IS NOT NULL AND c.viewer_id = p_viewer_id
             AND viewer_open_gallery_id(p_viewer_id) = p_gallery_id))
$$;

CREATE OR REPLACE FUNCTION public.add_gallery_comment(
  p_viewer_id uuid, p_image_id uuid, p_body text)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery_id uuid := viewer_open_gallery_id(p_viewer_id);
  v_comment gallery_comments;
BEGIN
  IF v_gallery_id IS NULL THEN
    RAISE EXCEPTION 'Gallery not available';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Comment is empty';
  END IF;
  IF p_image_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM gallery_images
       WHERE id = p_image_id AND gallery_id = v_gallery_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Image not in this gallery';
  END IF;

  INSERT INTO gallery_comments (gallery_id, image_id, viewer_id, body)
  VALUES (v_gallery_id, p_image_id, p_viewer_id, p_body)
  RETURNING * INTO v_comment;

  RETURN json_build_object(
    'id', v_comment.id, 'body', v_comment.body, 'created_at', v_comment.created_at,
    'image_id', v_comment.image_id, 'viewer_id', v_comment.viewer_id,
    'gallery_viewers', (SELECT json_build_object('email', email) FROM gallery_viewers WHERE id = p_viewer_id));
END;
$$;

-- Only the six actions client galleries log, and only for a real viewer of
-- an open gallery -- no more anonymous inserts into any gallery's feed.
CREATE OR REPLACE FUNCTION public.log_gallery_activity(
  p_viewer_id uuid, p_action text, p_image_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery_id uuid := viewer_open_gallery_id(p_viewer_id);
BEGIN
  IF v_gallery_id IS NULL THEN
    RAISE EXCEPTION 'Gallery not available';
  END IF;
  IF p_action NOT IN ('view', 'favorite', 'unfavorite', 'comment', 'download_single', 'download_all') THEN
    RAISE EXCEPTION 'Unknown activity: %', p_action;
  END IF;
  INSERT INTO gallery_activity_log (gallery_id, viewer_id, action, image_id, metadata)
  VALUES (v_gallery_id, p_viewer_id, p_action, p_image_id, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_viewer_selection(p_viewer_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object('id', s.id, 'image_ids', s.image_ids, 'image_count', s.image_count,
                           'submitted_at', s.submitted_at, 'note', s.note)
  FROM gallery_selections s
  WHERE s.viewer_id = p_viewer_id
    AND s.gallery_id = viewer_open_gallery_id(p_viewer_id)
$$;

CREATE OR REPLACE FUNCTION public.submit_gallery_selection(
  p_viewer_id uuid, p_image_ids uuid[], p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gallery_id uuid := viewer_open_gallery_id(p_viewer_id);
  v_viewer gallery_viewers;
  v_selection gallery_selections;
BEGIN
  IF v_gallery_id IS NULL THEN
    RAISE EXCEPTION 'Gallery not available';
  END IF;
  IF p_image_ids IS NULL OR cardinality(p_image_ids) = 0 THEN
    RAISE EXCEPTION 'Cannot submit an empty selection.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_image_ids) AS x(id)
             WHERE NOT EXISTS (SELECT 1 FROM gallery_images i
                               WHERE i.id = x.id AND i.gallery_id = v_gallery_id AND i.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Selection includes images not in this gallery';
  END IF;

  SELECT * INTO v_viewer FROM gallery_viewers WHERE id = p_viewer_id;

  INSERT INTO gallery_selections (gallery_id, viewer_id, image_ids, image_count,
                                  viewer_name, viewer_email, note, submitted_at)
  VALUES (v_gallery_id, p_viewer_id, p_image_ids, cardinality(p_image_ids),
          COALESCE(v_viewer.display_name, v_viewer.email, 'Anonymous'), v_viewer.email, p_note, now())
  ON CONFLICT (gallery_id, viewer_id) DO UPDATE
    SET image_ids = EXCLUDED.image_ids, image_count = EXCLUDED.image_count,
        viewer_name = EXCLUDED.viewer_name, viewer_email = EXCLUDED.viewer_email,
        note = EXCLUDED.note, submitted_at = EXCLUDED.submitted_at
  RETURNING * INTO v_selection;

  INSERT INTO gallery_activity_log (gallery_id, viewer_id, action)
  VALUES (v_gallery_id, p_viewer_id, 'selection_submitted');

  RETURN to_json(v_selection);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.viewer_open_gallery_id(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_or_create_gallery_viewer_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_gallery_viewer(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_viewer_favorites(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_gallery_favorite(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gallery_comments(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_gallery_comment(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_gallery_activity(uuid, text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_viewer_selection(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_gallery_selection(uuid, uuid[], text) TO anon, authenticated;
