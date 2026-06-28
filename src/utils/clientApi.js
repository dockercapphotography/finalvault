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
      event_date, plain_password, plain_download_pin, show_guide,
      theme_color, grid_size, grid_spacing, allow_proofing
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
    .select('display_name, business_name')
    .eq('id', photographerId)
    .single()
  return data?.business_name || data?.display_name || null
}

export async function getPhotographerBranding(photographerId) {
  const { data } = await supabase
    .from('photographers')
    .select('display_name, business_name, logo_r2_key')
    .eq('id', photographerId)
    .single()
  return {
    name: data?.business_name || data?.display_name || null,
    logoR2Key: data?.logo_r2_key || null,
  }
}

export async function getClientImages(galleryId) {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, preview_r2_key, original_r2_key, web_r2_key, file_name, file_size, width, height, sort_order, set_id, watermark_id, updated_at, watermarks(r2_key, opacity, position, scale)')
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function getOrCreateViewer(galleryId, email) {
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
    .insert({ gallery_id: galleryId, session_id: sessionId, email: email })
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

export async function getComments(galleryId, imageId = null, viewerId = null) {
  // 2026-06-28: scoped to the caller's own comments + all photographer
  // comments, rather than every viewer's comments. RLS (see
  // 029_gallery_comments_rls_scope_viewer.sql) enforces this as a ceiling
  // regardless of what's requested here, but the app should still ask for
  // the right thing rather than rely on the database to silently narrow
  // an over-broad request.
  let query = supabase
    .from('gallery_comments')
    .select(`
      id, body, created_at, image_id,
      viewer_id, photographer_id,
      gallery_viewers (display_name, email),
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
  if (viewerId) {
    query = query.or(`viewer_id.eq.${viewerId},photographer_id.not.is.null`)
  } else {
    // No viewer context (e.g. not past the gate yet) -- only photographer
    // comments are visible, matching what RLS would return anyway.
    query = query.not('photographer_id', 'is', null)
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
      viewer_id, gallery_viewers (email)
    `)
    .single()
  if (error) throw error
  await logActivity(galleryId, viewerId, 'comment', imageId || null, { comment_body: body })
  return data
}

export function getPreviewUrl(r2Key, shareToken, cacheBust) {
  const base = `${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`
  const bust = cacheBust ? `&t=${encodeURIComponent(cacheBust)}` : ''
  return shareToken
    ? `${base}?share_token=${shareToken}${bust}`
    : bust
      ? `${base}?${bust.slice(1)}`
      : base
}

/**
 * Download a web-size (2048px, watermarked) JPEG.
 * Passes the image's stored watermark_id so the worker applies the exact
 * watermark that was baked into the preview.
 *
 * @param {string} originalR2Key  - image.original_r2_key
 * @param {string} fileName       - desired download filename (should end in _web.jpg)
 * @param {string} shareToken
 * @param {string|null} pinToken
 * @param {string|null} watermarkId - image.watermark_id
 */
export async function downloadWebSize(originalR2Key, fileName, shareToken, pinToken = null, watermarkId = null, webR2Key = null) {
  const params = new URLSearchParams({ size: 'web' })
  if (watermarkId) params.set('watermark_id', watermarkId)
  if (webR2Key) params.set('web_key', encodeURIComponent(webR2Key))

  const headers = {}
  if (shareToken) headers['X-Share-Token'] = shareToken
  if (pinToken) headers['X-Download-Pin'] = pinToken

  const resp = await fetch(
    `${WORKER_URL}/download/${encodeURIComponent(originalR2Key)}?${params}`,
    { headers, credentials: 'omit' }
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Download failed')
  }

  const blob = await resp.blob()
  triggerBrowserDownload(blob, fileName)
}

/**
 * Download the original high-resolution file (no watermark, no resize).
 *
 * @param {string} originalR2Key
 * @param {string} fileName
 * @param {string|null} shareToken
 * @param {string|null} pinToken
 */
export async function downloadHiRes(originalR2Key, fileName, shareToken = null, pinToken = null) {
  const params = new URLSearchParams({ size: 'hires' })

  const headers = {}
  if (shareToken) headers['X-Share-Token'] = shareToken
  if (pinToken) headers['X-Download-Pin'] = pinToken

  const resp = await fetch(
    `${WORKER_URL}/download/${encodeURIComponent(originalR2Key)}?${params}`,
    { headers, credentials: 'omit' }
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Download failed')
  }

  const blob = await resp.blob()
  triggerBrowserDownload(blob, fileName)
}

/**
 * @deprecated Use downloadWebSize() instead.
 */
export async function downloadPreview(originalR2Key, fileName, shareToken = null, pinToken = null, watermarkId = null) {
  return downloadWebSize(originalR2Key, fileName, shareToken, pinToken, watermarkId)
}

/**
 * @deprecated Use downloadHiRes() instead.
 */
export async function downloadOriginal(originalR2Key, fileName, shareToken = null, pinToken = null, hires = true, watermarkId = null) {
  if (hires) return downloadHiRes(originalR2Key, fileName, shareToken, pinToken)
  return downloadWebSize(originalR2Key, fileName, shareToken, pinToken, watermarkId)
}

/**
 * Download a ZIP of multiple images.
 *
 * size='hires': hits the worker, ZIPs raw originals (fast, no CPU issue)
 * size='web':   client-side processing — fetches each original, resizes to 2048px,
 *               composites watermark via canvas, encodes JPEG, ZIPs in browser.
 *               Sequential to keep memory manageable.
 *
 * @param {string} galleryId
 * @param {string} shareToken
 * @param {string[]} imageKeys        - original_r2_key values
 * @param {string[]} fileNames        - display filenames
 * @param {string} galleryTitle
 * @param {string|null} downloadPin
 * @param {string} size               - 'web' | 'hires'
 * @param {Array<string|null>} watermarkIds - unused, kept for compat
 * @param {Array<object|null>} watermarkConfigs - image.watermarks objects (r2_key, opacity, position, scale)
 * @param {function} onProgress       - called with (current, total) after each image
 */
export async function downloadZip(galleryId, shareToken, imageKeys, fileNames = [], galleryTitle = 'gallery', downloadPin = null, size = 'hires', watermarkIds = [], watermarkConfigs = [], onProgress = null) {
  if (size === 'web') {
    return downloadZipClientSide(imageKeys, fileNames, galleryTitle, shareToken, downloadPin, watermarkConfigs, onProgress)
  }

  // Hires: worker streams the ZIP back one image at a time — raw originals,
  // no processing. We read the response as a stream (rather than resp.blob())
  // so we can report real download progress instead of the UI sitting idle
  // until the entire archive has arrived.
  const headers = {
    'Content-Type': 'application/json',
    'X-Share-Token': shareToken,
  }
  if (downloadPin) headers['X-Download-Pin'] = downloadPin

  const resp = await fetch(`${WORKER_URL}/download-zip`, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: JSON.stringify({ galleryId, imageKeys, fileNames, size: 'hires', watermarkIds }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Download failed')
  }

  const reader = resp.body.getReader()
  const chunks = []
  let bytesReceived = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    bytesReceived += value.byteLength
    onProgress?.(bytesReceived)
  }

  const blob = new Blob(chunks, { type: 'application/zip' })
  const safeName = galleryTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  triggerBrowserDownload(blob, `${safeName}.zip`)
}

/**
 * Client-side web ZIP processing.
 * Fetches each original, resizes + watermarks via canvas, encodes JPEG, ZIPs with JSZip.
 * Sequential to keep peak memory to one image at a time.
 */
async function downloadZipClientSide(imageKeys, fileNames, galleryTitle, shareToken, downloadPin, watermarkConfigs, onProgress) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const total = imageKeys.length

  // Pre-fetch unique watermark images as blob URLs (keyed by r2_key)
  const wmBlobCache = {}
  for (const wm of watermarkConfigs) {
    if (wm?.r2_key && !wmBlobCache[wm.r2_key]) {
      try {
        const headers = { 'X-Share-Token': shareToken }
        if (downloadPin) headers['X-Download-Pin'] = downloadPin
        const resp = await fetch(`${WORKER_URL}/watermark/${encodeURIComponent(wm.r2_key)}`, { headers, credentials: 'omit' })
        if (resp.ok) wmBlobCache[wm.r2_key] = URL.createObjectURL(await resp.blob())
      } catch { /* skip watermark if fetch fails */ }
    }
  }

  for (let i = 0; i < imageKeys.length; i++) {
    const key = imageKeys[i]
    const fileName = fileNames[i] || key.split('/').pop().replace(/\.[^.]+$/, '_web.jpg')
    const wmConfig = watermarkConfigs[i] || null
    const wmBlobUrl = wmConfig?.r2_key ? wmBlobCache[wmConfig.r2_key] : null

    try {
      // Fetch original through worker
      const headers = { 'X-Share-Token': shareToken }
      if (downloadPin) headers['X-Download-Pin'] = downloadPin
      const params = new URLSearchParams({ size: 'hires' })
      const resp = await fetch(`${WORKER_URL}/download/${encodeURIComponent(key)}?${params}`, { headers, credentials: 'omit' })
      if (!resp.ok) continue

      const blob = await resp.blob()
      const jpegBlob = await processImageClientSide(blob, wmConfig, wmBlobUrl)
      zip.file(fileName, jpegBlob)
    } catch (err) {
      console.error(`Failed to process ${fileName}:`, err)
    }

    onProgress?.(i + 1, total)
  }

  // Clean up watermark blob URLs
  for (const url of Object.values(wmBlobCache)) URL.revokeObjectURL(url)

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  const safeName = galleryTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  triggerBrowserDownload(zipBlob, `${safeName}.zip`)
}

/**
 * Resize image to 2048px long edge, composite watermark, encode as JPEG.
 * Returns a Blob.
 */
async function processImageClientSide(imageBlob, wmConfig, wmBlobUrl) {
  const MAX_LONG_EDGE = 2048
  const bitmap = await createImageBitmap(imageBlob)
  const { width: origW, height: origH } = bitmap

  let newW = origW
  let newH = origH
  if (origW > MAX_LONG_EDGE || origH > MAX_LONG_EDGE) {
    if (origW >= origH) {
      newW = MAX_LONG_EDGE
      newH = Math.round((origH / origW) * MAX_LONG_EDGE)
    } else {
      newH = MAX_LONG_EDGE
      newW = Math.round((origW / origH) * MAX_LONG_EDGE)
    }
  }

  const canvas = new OffscreenCanvas(newW, newH)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, newW, newH)
  bitmap.close()

  // Composite watermark if available
  if (wmConfig && wmBlobUrl) {
    try {
      const wmBitmap = await createImageBitmap(await fetch(wmBlobUrl).then(r => r.blob()))
      const wmW = Math.round(newW * (wmConfig.scale ?? 0.15))
      const wmH = Math.round((wmBitmap.height / wmBitmap.width) * wmW)
      const padding = Math.round(newW * 0.02)
      const { x, y } = getWatermarkPosition(wmConfig.position, newW, newH, wmW, wmH, padding)
      ctx.save()
      ctx.globalAlpha = wmConfig.opacity ?? 0.5
      ctx.drawImage(wmBitmap, x, y, wmW, wmH)
      ctx.restore()
      wmBitmap.close()
    } catch (err) {
      console.warn('Watermark composite failed:', err)
    }
  }

  return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
}

function getWatermarkPosition(position, cW, cH, wmW, wmH, pad) {
  switch (position) {
    case 'top-left':     return { x: pad, y: pad }
    case 'top-right':    return { x: cW - wmW - pad, y: pad }
    case 'bottom-left':  return { x: pad, y: cH - wmH - pad }
    case 'center':       return { x: Math.round((cW - wmW) / 2), y: Math.round((cH - wmH) / 2) }
    case 'bottom-right':
    default:             return { x: cW - wmW - pad, y: cH - wmH - pad }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function triggerBrowserDownload(blob, fileName) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  if (isIOS && navigator.canShare) {
    try {
      const ext = fileName.split('.').pop().toLowerCase()
      const mimeType = blob.type || (ext === 'zip' ? 'application/zip' : 'image/jpeg')
      const file = new File([blob], fileName, { type: mimeType })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName })
        return
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      console.warn('Share failed, falling back:', err)
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

export async function getClientSets(galleryId) {
  const { data, error } = await supabase
    .from('gallery_sets')
    .select('id, name, sort_order')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}
