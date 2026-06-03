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
      cover_image_id, folder_id,
      gallery_images!cover_image_id (preview_r2_key),
      image_count:gallery_images!gallery_images_gallery_id_fkey(count)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getGallery(id) {
  const { data, error } = await supabase
    .from('galleries')
    .select('*, plain_password, plain_download_pin')
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
  watermarkId, folderId,
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
      require_download_pin: requireDownloadPin ?? false,
      watermark_id: watermarkId || null,
      folder_id: folderId || null,
      photographer_id: user.id,
      share_token: generateShareToken(),
    })
    .select()
    .single()

  if (error) throw error
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
    .select('id, name, parent_id, path, created_at, updated_at')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Returns folders that are direct children of parentId (null = top-level).
export async function getChildFolders(parentId = null) {
  let query = supabase
    .from('gallery_folders')
    .select('id, name, parent_id, path, created_at, updated_at')
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
      cover_image_id, folder_id,
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
