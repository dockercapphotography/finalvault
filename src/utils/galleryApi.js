import { supabase } from '../supabaseClient.js'
import { supabaseAnon } from '../supabaseClientAnon.js'

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, '')
}

// ── Galleries ─────────────────────────────────────────────────────────────────

export async function getGalleries() {
  const { data, error } = await supabase
    .from('galleries')
    .select(`
      id, title, client_name, event_name, event_date, template,
      is_active, share_token, require_password,
      created_at, updated_at, expires_at,
      cover_image_id, cover_r2_key, folder_id,
      gallery_images!cover_image_id (preview_r2_key),
      image_count:gallery_images!gallery_images_gallery_id_fkey(count),
      tags:gallery_tag_assignments(gallery_tags(id, name, color))
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  // Normalize nested tag shape: [{gallery_tags: {id, name, color}}] -> [{id, name, color}]
  return (data ?? []).map(g => ({
    ...g,
    tags: (g.tags ?? []).map(t => t.gallery_tags).filter(Boolean),
  }))
}

export async function getGallery(id) {
  const { data, error } = await supabase
    .from('galleries')
    .select('*, plain_password, plain_download_pin, gallery_clients(client_id, clients(id, first_name, last_name, email))')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createGallery({
  title, clientName, eventName, notes, eventDate,
  themeColor, gridSize, gridSpacing,
  allowDownloads, downloadWatermarked, allowHiresDownload,
  allowFavorites, allowComments, requirePassword, requireDownloadPin,
  password, downloadPin,
  watermarkId, folderId, clientId,
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('galleries')
    .insert({
      title,
      client_name: clientName,
      event_name: eventName || null,
      notes,
      event_date: eventDate || null,
      theme_color: themeColor || 'light',
      grid_size: gridSize || 'medium',
      grid_spacing: gridSpacing || 'tight',
      allow_downloads: allowDownloads ?? true,
      download_watermarked: downloadWatermarked ?? false,
      allow_hires_download: allowHiresDownload ?? false,
      allow_favorites: allowFavorites ?? true,
      allow_comments: allowComments ?? true,
      require_password: requirePassword ?? false,
      plain_password: requirePassword ? (password || null) : null,
      require_download_pin: requireDownloadPin ?? false,
      plain_download_pin: requireDownloadPin ? (downloadPin || null) : null,
      watermark_id: watermarkId || null,
      folder_id: folderId || null,
      photographer_id: user.id,
      share_token: generateShareToken(),
    })
    .select()
    .single()

  if (error) throw error

  // Link via gallery_clients (the sole source of truth for gallery-client
  // links now) rather than the legacy client_id column.
  if (clientId) {
    const { error: linkError } = await supabase
      .from('gallery_clients')
      .insert({ gallery_id: data.id, client_id: clientId })
    if (linkError) throw linkError
  }

  return data
}

export async function updateGallery(id, updates) {
  const { data, error } = await supabase
    .from('galleries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteGallery(id) {
  const { error } = await supabase
    .from('galleries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Returns galleries not yet linked to the given client — used by the
// "Attach Gallery" picker on ClientDetail.jsx. A gallery can now be linked
// to more than one client (e.g. both spouses in a wedding), so this only
// excludes galleries already linked to THIS client -- a gallery linked to
// a different client should still show up as available here.
export async function getUnlinkedGalleries(clientId) {
  const { data: linkedRows, error: linkedErr } = await supabase
    .from('gallery_clients')
    .select('gallery_id')
    .eq('client_id', clientId)
  if (linkedErr) throw linkedErr
  const linkedIds = (linkedRows ?? []).map(r => r.gallery_id)

  let query = supabase
    .from('galleries')
    .select('id, title, event_name, event_date, created_at')
    .order('created_at', { ascending: false })
  if (linkedIds.length > 0) {
    query = query.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// Links one or more galleries to a client. Safe to call with galleries
// already linked to this client -- duplicates are silently ignored rather
// than erroring, via the (gallery_id, client_id) unique constraint.
export async function linkGalleriesToClient(galleryIds, clientId) {
  const rows = galleryIds.map(galleryId => ({ gallery_id: galleryId, client_id: clientId }))
  const { error } = await supabase
    .from('gallery_clients')
    .upsert(rows, { onConflict: 'gallery_id,client_id', ignoreDuplicates: true })
  if (error) throw error
}

// Removes the link between a gallery and a client (the client loses portal
// access to that gallery). Does not affect the gallery's other client
// links, if any.
export async function unlinkGalleryFromClient(galleryId, clientId) {
  const { error } = await supabase
    .from('gallery_clients')
    .delete()
    .eq('gallery_id', galleryId)
    .eq('client_id', clientId)
  if (error) throw error
}

export async function getGalleryImageCount(galleryId) {
  const { count, error } = await supabase
    .from('gallery_images')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)

  if (error) throw error
  return count ?? 0
}

// ── Folders ───────────────────────────────────────────────────────────────────

// Returns all folders for the current photographer, flat list.
// Caller is responsible for building the tree structure in the UI.
export async function getFolders() {
  const { data, error } = await supabase
    .from('gallery_folders')
    .select('id, name, parent_id, path, cover_r2_key, cover_focus_x, cover_focus_y, photographer_id, created_at, updated_at')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Returns folders that are direct children of parentId (null = top-level).
export async function getChildFolders(parentId = null) {
  let query = supabase
    .from('gallery_folders')
    .select('id, name, parent_id, path, cover_r2_key, cover_focus_x, cover_focus_y, photographer_id, created_at, updated_at')
    .order('name', { ascending: true })

  if (parentId === null) {
    query = query.is('parent_id', null)
  } else {
    query = query.eq('parent_id', parentId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

// Returns galleries that belong directly to a folder (null = ungrouped).
export async function getGalleriesInFolder(folderId = null) {
  let query = supabase
    .from('galleries')
    .select(`
      id, title, client_name, event_name, event_date, template,
      is_active, share_token, require_password,
      created_at, updated_at, expires_at,
      cover_image_id, cover_r2_key, folder_id,
      gallery_images!cover_image_id (preview_r2_key),
      image_count:gallery_images!gallery_images_gallery_id_fkey(count)
    `)
    .order('created_at', { ascending: false })

  if (folderId === null) {
    query = query.is('folder_id', null)
  } else {
    query = query.eq('folder_id', folderId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createFolder(name, parentId = null) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('gallery_folders')
    .insert({
      name: name.trim(),
      parent_id: parentId || null,
      photographer_id: user.id,
      // path is set automatically by the set_folder_path trigger
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function renameFolder(id, name) {
  const { data, error } = await supabase
    .from('gallery_folders')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Returns counts of subfolders and galleries in a folder's entire subtree.
// Uses a server-side RPC to avoid client-side ltree query limitations.
export async function getFolderTreeCounts(id) {
  const { data, error } = await supabase.rpc('get_folder_tree_counts', {
    root_folder_id: id,
  })
  if (error || !data) return { subfolderCount: 0, galleryCount: 0 }
  return {
    subfolderCount: data.subfolder_count ?? 0,
    galleryCount: data.gallery_count ?? 0,
  }
}

// Deletes a folder and its entire subtree (all subfolders + galleries).
// Uses a server-side RPC for the recursive delete.
// Returns { ok, error } — caller should reload folders/galleries from DB after success.
export async function deleteFolderTree(id) {
  const { data, error } = await supabase.rpc('delete_folder_tree', {
    root_folder_id: id,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Moves a folder (and its entire subtree) under a new parent folder.
// newParentId = null moves it to the top level.
// Server-side RPC handles cascading the ltree `path` update to the folder
// and all its descendants (the INSERT-only set_folder_path trigger does
// not do this on its own), and rejects moves that would create a cycle
// (into itself or into one of its own descendants).
export async function moveFolder(folderId, newParentId) {
  const { error } = await supabase.rpc('move_folder_tree', {
    p_folder_id: folderId,
    p_new_parent_id: newParentId,
  })
  if (error) throw error
}

// Updates a folder's cover image.
export async function updateFolderCover(folderId, coverR2Key, focusX = 0.5, focusY = 0.5) {
  const { data, error } = await supabase
    .from('gallery_folders')
    .update({ cover_r2_key: coverR2Key, cover_focus_x: focusX, cover_focus_y: focusY, updated_at: new Date().toISOString() })
    .eq('id', folderId)
    .select()
    .single()
  if (error) throw error
  return data
}

// Returns preview images from all galleries directly inside a folder.
// Used to populate the folder cover picker.
export async function getFolderImages(folderId) {
  // Get gallery IDs in this folder
  const { data: galleries, error: gErr } = await supabase
    .from('galleries')
    .select('id')
    .eq('folder_id', folderId)
  if (gErr) throw gErr
  if (!galleries?.length) return []

  const galleryIds = galleries.map(g => g.id)
  const { data: images, error: iErr } = await supabase
    .from('gallery_images')
    .select('id, preview_r2_key, file_name')
    .in('gallery_id', galleryIds)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(50)
  if (iErr) throw iErr
  return images ?? []
}

// Moves a gallery into a folder (or out to ungrouped if folderId is null).
export async function moveGalleryToFolder(galleryId, folderId) {
  const { data, error } = await supabase
    .from('galleries')
    .update({ folder_id: folderId || null, updated_at: new Date().toISOString() })
    .eq('id', galleryId)
    .select()
    .single()

  if (error) throw error
  return data
}

// Given a folder ID, returns the full ancestor chain from root down to that
// folder. Used to build breadcrumbs. Returns array of { id, name } objects.
export async function getFolderAncestors(folderId) {
  if (!folderId) return []

  // Fetch the target folder's path, then fetch all folders whose IDs appear
  // in that path (which gives us the full ancestor chain including self).
  const { data: target, error: targetErr } = await supabase
    .from('gallery_folders')
    .select('id, name, path')
    .eq('id', folderId)
    .single()

  if (targetErr || !target) return []

  // Extract ancestor IDs from the ltree path string.
  // Path looks like "abc123.def456.ghi789" — split on '.' to get segments,
  // then re-attach hyphens to recover UUIDs.
  const segments = target.path.split('.')
  const ancestorIds = segments.map(seg => {
    // Re-insert hyphens: 8-4-4-4-12
    return `${seg.slice(0,8)}-${seg.slice(8,12)}-${seg.slice(12,16)}-${seg.slice(16,20)}-${seg.slice(20)}`
  })

  const { data: ancestors, error: ancestorErr } = await supabase
    .from('gallery_folders')
    .select('id, name')
    .in('id', ancestorIds)

  if (ancestorErr) return []

  // Sort ancestors to match the path order
  return ancestorIds
    .map(id => ancestors.find(a => a.id === id))
    .filter(Boolean)
}

// Builds a consistent breadcrumb trail for any gallery-adjacent page
// (GalleryDetail, GallerySettings, GalleryActivity, etc).
//
// gallery          — the gallery row (needs .id, .title, .folder_id)
// folderAncestors  — array of { id, name } from getFolderAncestors(gallery.folder_id),
//                    root-first order. Pass [] for an ungrouped gallery.
// currentLabel     — optional. If provided, appended as the final
//                    non-clickable crumb (e.g. 'Settings', 'Activity').
//                    If omitted, the gallery title itself is the final crumb.
//
// Every folder crumb and the root 'Galleries' crumb carry toState.restoreFolderPath
// so Dashboard's existing restore-on-mount logic lands back in the exact folder,
// regardless of how the page was reached (card click, direct link, refresh).
export function buildGalleryCrumbs(gallery, folderAncestors = [], currentLabel = null) {
  const crumbs = [
    { label: 'Galleries', to: '/', toState: { restoreFolderPath: [] } },
    ...folderAncestors.map((folder, i, arr) => ({
      label: folder.name,
      to: '/',
      toState: { restoreFolderPath: arr.slice(0, i + 1) },
    })),
  ]

  if (currentLabel) {
    crumbs.push({ label: gallery.title, to: `/galleries/${gallery.id}`, toState: { folderAncestors } })
    crumbs.push({ label: currentLabel })
  } else {
    crumbs.push({ label: gallery.title })
  }

  return crumbs
}

// ── Dead code — Client Proofing (removed in v1.1.0, kept for reference) ──────

function _parseImageIds(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

export async function submitSelection(galleryId, viewerId, imageIds, note = null) {
  if (!imageIds || imageIds.length === 0) {
    return { ok: false, error: 'Cannot submit an empty selection.' }
  }

  const { data: viewer, error: viewerErr } = await supabaseAnon
    .from('gallery_viewers')
    .select('display_name, email')
    .eq('id', viewerId)
    .single()

  if (viewerErr) return { ok: false, error: viewerErr.message }

  const { data: selection, error: selectionErr } = await supabaseAnon
    .from('gallery_selections')
    .upsert(
      {
        gallery_id:   galleryId,
        viewer_id:    viewerId,
        image_ids:    imageIds,
        image_count:  imageIds.length,
        viewer_name:  viewer.display_name || viewer.email || 'Anonymous',
        viewer_email: viewer.email ?? null,
        note:         note ?? null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'gallery_id,viewer_id' }
    )
    .select()
    .single()

  if (selectionErr) return { ok: false, error: selectionErr.message }

  const { error: logErr } = await supabaseAnon
    .from('gallery_activity_log')
    .insert({
      gallery_id: galleryId,
      viewer_id:  viewerId,
      action:     'selection_submitted',
    })

  if (logErr) {
    console.error('[submitSelection] Failed to write activity log:', logErr.message)
  }

  return { ok: true, data: selection }
}

export async function getViewerSelection(galleryId, viewerId) {
  const { data, error } = await supabaseAnon
    .from('gallery_selections')
    .select('id, image_ids, image_count, submitted_at, note')
    .eq('gallery_id', galleryId)
    .eq('viewer_id', viewerId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (data) data.image_ids = _parseImageIds(data.image_ids)
  return { ok: true, data: data ?? null }
}

export async function getGallerySelections(galleryId) {
  const { data, error } = await supabase
    .from('gallery_selections')
    .select('id, viewer_id, viewer_name, viewer_email, image_ids, image_count, submitted_at, note')
    .eq('gallery_id', galleryId)
    .order('submitted_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  const normalised = (data ?? []).map(s => ({ ...s, image_ids: _parseImageIds(s.image_ids) }))
  return { ok: true, data: normalised }
}

export async function getSelectionImages(imageIds) {
  if (!imageIds || imageIds.length === 0) {
    return { ok: true, data: [] }
  }

  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, preview_r2_key, file_name')
    .in('id', imageIds)

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data ?? [] }
}

// ── Gallery Tags ──────────────────────────────────────────────────────────────

// Fetch all tags for the current photographer, with usage counts.
export async function getTags() {
  const { data, error } = await supabase
    .from('gallery_tags')
    .select(`
      id, name, color, created_at, updated_at,
      usage_count:gallery_tag_assignments(count)
    `)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(t => ({
    ...t,
    usage_count: t.usage_count?.[0]?.count ?? 0,
  }))
}

// Create a new tag for the current photographer.
export async function createTag({ name, color = null }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('gallery_tags')
    .insert({
      photographer_id: user.id,
      name: name.trim().toLowerCase(),
      color: color || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Update an existing tag (rename or recolor).
export async function updateTag(id, { name, color }) {
  const updates = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim().toLowerCase()
  if (color !== undefined) updates.color = color || null

  const { data, error } = await supabase
    .from('gallery_tags')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete a tag — cascades to all gallery_tag_assignments via FK.
export async function deleteTag(id) {
  const { error } = await supabase
    .from('gallery_tags')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Fetch all tags assigned to a specific gallery.
export async function getGalleryTags(galleryId) {
  const { data, error } = await supabase
    .from('gallery_tag_assignments')
    .select('tag_id, gallery_tags(id, name, color)')
    .eq('gallery_id', galleryId)

  if (error) throw error
  return (data ?? []).map(row => row.gallery_tags)
}

// Assign an existing tag to a gallery.
export async function assignTag(galleryId, tagId) {
  const { error } = await supabase
    .from('gallery_tag_assignments')
    .upsert({ gallery_id: galleryId, tag_id: tagId }, { onConflict: 'gallery_id,tag_id' })

  if (error) throw error
}

// Remove a tag assignment from a gallery.
export async function unassignTag(galleryId, tagId) {
  const { error } = await supabase
    .from('gallery_tag_assignments')
    .delete()
    .eq('gallery_id', galleryId)
    .eq('tag_id', tagId)

  if (error) throw error
}

// Create a new tag and immediately assign it to a gallery.
// Returns the new tag.
export async function createAndAssignTag(galleryId, { name, color = null }) {
  const tag = await createTag({ name, color })
  await assignTag(galleryId, tag.id)
  return tag
}

// Post a photographer reply on a client's comment thread. Uses the real
// authenticated client (not supabaseAnon) -- RLS (see
// 030_gallery_comments_photographer_insert.sql) requires photographer_id
// to match auth.uid() and the gallery to belong to the calling
// photographer. Does NOT call logActivity -- a photographer's own reply
// to their own gallery shouldn't show up in their own activity feed as
// something to review.
export async function addPhotographerReply(galleryId, imageId, body) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('gallery_comments')
    .insert({
      gallery_id: galleryId,
      image_id: imageId || null,
      photographer_id: user.id,
      body,
    })
    .select('id, body, created_at, image_id, photographer_id')
    .single()
  if (error) throw error
  return data
}
