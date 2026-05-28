// Client-facing API — viewers, favorites, comments
import { supabaseAnon as supabase } from '../supabaseClientAnon.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

export async function getGalleryByToken(token) {
  const { data, error } = await supabase
    .from('galleries')
    .select(`
      id, title, client_name, event_name, template, is_active, expires_at,
      require_password, allow_downloads, allow_favorites, allow_comments,
      require_download_pin, download_watermarked, allow_hires_download, share_token,
      photographer_id, cover_image_id, cover_r2_key, cover_focus_x, cover_focus_y,
      event_date, plain_password, plain_download_pin,
      theme_color, grid_size, grid_spacing
    `)
    .eq('share_token', token)
    .single()
  if (error) throw error
  return data
}

export async function verifyGalleryPassword(galleryId, password) {
  const { data, error } = await supabase
    .from('galleries')
    .select('plain_password')
    .eq('id', galleryId)
    .single()
  if (error) throw error
  return data?.plain_password === password
}

export async function verifyDownloadPin(galleryId, pin) {
  const { data, error } = await supabase
    .from('galleries')
    .select('plain_download_pin')
    .eq('id', galleryId)
    .single()
  if (error) throw error
  return data?.plain_download_pin === pin
}

export async function getPhotographerName(photographerId) {
  const { data } = await supabase
    .from('photographers')
    .select('display_name')
    .eq('id', photographerId)
    .single()
  return data?.display_name || null
}

export async function getClientImages(galleryId) {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, preview_r2_key, original_r2_key, file_name, width, height, sort_order')
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function getOrCreateViewer(galleryId, displayName) {
  const storageKey = `fv-viewer-${galleryId}`
  const existing = localStorage.getItem(storageKey)
  if (existing) {
    const { id: viewerId } = JSON.parse(existing)
    await supabase
      .from('gallery_viewers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', viewerId)
    return JSON.parse(existing)
  }
  const sessionId = crypto.randomUUID()
  const { data, error } = await supabase
    .from('gallery_viewers')
    .insert({ gallery_id: galleryId, session_id: sessionId, display_name: displayName })
    .select()
    .single()
  if (error) throw error
  localStorage.setItem(storageKey, JSON.stringify(data))
  return data
}

export function getViewerFromSession(galleryId) {
  const stored = localStorage.getItem(`fv-viewer-${galleryId}`)
  return stored ? JSON.parse(stored) : null
}

export async function getViewerFavorites(galleryId, viewerId) {
  const { data, error } = await supabase
    .from('gallery_favorites')
    .select('image_id')
    .eq('gallery_id', galleryId)
    .eq('viewer_id', viewerId)
  if (error) throw error
  return new Set(data.map(f => f.image_id))
}

export async function toggleFavorite(galleryId, imageId, viewerId) {
  const { data: existing } = await supabase
    .from('gallery_favorites')
    .select('id')
    .eq('image_id', imageId)
    .eq('viewer_id', viewerId)
    .maybeSingle()
  if (existing) {
    await supabase.from('gallery_favorites').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('gallery_favorites').insert({ gallery_id: galleryId, image_id: imageId, viewer_id: viewerId })
    return true
  }
}

export async function getComments(galleryId, imageId = null) {
  let query = supabase
    .from('gallery_comments')
    .select(`
      id, body, created_at, image_id,
      viewer_id, photographer_id,
      gallery_viewers (display_name),
      photographers (display_name)
    `)
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (imageId) {
    query = query.eq('image_id', imageId)
  } else {
    query = query.is('image_id', null)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function addComment(galleryId, imageId, viewerId, body) {
  const { data, error } = await supabase
    .from('gallery_comments')
    .insert({
      gallery_id: galleryId,
      image_id: imageId || null,
      viewer_id: viewerId,
      body,
    })
    .select(`
      id, body, created_at, image_id,
      viewer_id, gallery_viewers (display_name)
    `)
    .single()
  if (error) throw error
  await logActivity(galleryId, viewerId, 'comment', imageId || null, { comment_body: body })
  return data
}

export function getPreviewUrl(r2Key, shareToken) {
  const base = `${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`
  return shareToken ? `${base}?share_token=${shareToken}` : base
}

export async function downloadOriginal(r2Key, fileName, shareToken = null, pinToken = null, hires = true) {
  const headers = {}
  if (shareToken) headers['X-Share-Token'] = shareToken
  if (pinToken) headers['X-Download-Pin'] = pinToken
  if (hires) headers['X-Hires'] = 'true'

  const resp = await fetch(`${WORKER_URL}/original/${encodeURIComponent(r2Key)}`, {
    headers,
    credentials: 'omit',
  })
  if (!resp.ok) throw new Error('Download failed')

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadPreview(r2Key, fileName, shareToken = null) {
  const url = `${WORKER_URL}/preview/${encodeURIComponent(r2Key)}?share_token=${shareToken || ''}`
  const resp = await fetch(url, { credentials: 'omit' })
  if (!resp.ok) throw new Error('Download failed')
  const blob = await resp.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

export async function downloadZip(galleryId, shareToken, imageKeys, fileNames = [], galleryTitle = 'gallery', downloadPin = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Share-Token': shareToken,
  }
  if (downloadPin) headers['X-Download-Pin'] = downloadPin

  const resp = await fetch(`${WORKER_URL}/download-zip`, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: JSON.stringify({ galleryId, imageKeys, fileNames }),
  })
  if (!resp.ok) {
    const err = await resp.json()
    throw new Error(err.error || 'Download failed')
  }

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = galleryTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  a.download = `${safeName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function logActivity(galleryId, viewerId, action, imageId = null, metadata = null) {
  if (action === 'view') {
    const key = `fv-viewed-${galleryId}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  }
  try {
    await supabase.from('gallery_activity_log').insert({
      gallery_id: galleryId,
      viewer_id: viewerId,
      action,
      image_id: imageId || null,
      metadata: metadata || null,
    })
  } catch (err) {
    console.warn('Activity log failed:', err)
  }
}
