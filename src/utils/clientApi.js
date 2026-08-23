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

/**
 * Photographer's own account email, for the one case where a client-facing
 * page needs it: preview mode has no gallery_viewers record (no name-gate
 * runs when a photographer previews their own gallery), so there's no
 * viewer email to notify when a hi-res download queues async. Scoped
 * through gallery_id server-side, see sql/028.
 */
export async function getGalleryPhotographerEmail(galleryId) {
  const { data, error } = await supabase.rpc('get_gallery_photographer_email', {
    p_gallery_id: galleryId,
  })
  if (error) return null
  return data || null
}

export async function getPhotographerBranding(photographerId) {
  const { data } = await supabase
    .from('photographers')
    .select('display_name, business_name, logo_r2_key, avatar_r2_key')
    .eq('id', photographerId)
    .single()
  return {
    name: data?.business_name || data?.display_name || null,
    logoR2Key: data?.logo_r2_key || null,
    avatarR2Key: data?.avatar_r2_key || null,
  }
}

// Module-level cache, keyed by token. Without this, every portal page
// (Galleries/Contracts/ContractDetail/Questionnaires) runs its own
// getPortalData call on mount -- since the portal is structured as real
// sub-routes (not tabs on one route, by design), navigating between
// sections remounts a fresh page component every time, which re-ran the
// full RPC from scratch on every single click. This was traced via console
// logging through a sidebar-header flash that initially looked like a
// branding-caching problem but was actually this -- the header had nothing
// to render because the *whole page's* photographer_id was still loading,
// not because branding itself was slow.
//
// Short TTL rather than a session-long cache: if a client signs a contract
// or submits a questionnaire (separate routes, /sign/:token and
// /submit/:token) and navigates back into the portal, a session-long cache
// would show stale data -- the contract would still look unsigned, the
// questionnaire would still look outstanding -- until a hard refresh.
// Explicit invalidation from those pages was considered but means coupling
// two unrelated routes to this cache and threading the portal token through
// to them just to clear one entry. A 30s TTL is a good-enough probabilistic
// fix instead: clicking between portal sections stays instant within that
// window (the actual problem this cache was built to solve), while anyone
// taking longer than that to sign or submit -- the realistic case -- gets
// fresh data automatically on their next portal page load, no extra
// plumbing required anywhere else.
const PORTAL_DATA_TTL_MS = 30_000
const portalDataCache = new Map() // token -> { data, expiresAt }

// Some clients now have an optional password gating their portal, checked
// server-side inside get_client_portal_data itself (see FinalVault handoff
// notes) -- the RPC has no notion of a session, so the correct password
// has to be resent on every call, not just the first one. sessionStorage
// (not localStorage) holds it for the tab's lifetime: long enough that
// navigating between portal sections doesn't re-prompt, short enough that
// closing the tab re-gates, which matters more here than for a typical
// login since this password guards contracts and gallery access codes.
const PORTAL_PW_STORAGE_PREFIX = 'fv-portal-pw-'

function getStoredPortalPassword(token) {
  try {
    return sessionStorage.getItem(PORTAL_PW_STORAGE_PREFIX + token)
  } catch {
    return null // sessionStorage can throw in some privacy modes -- treat as "no password on hand"
  }
}

function storePortalPassword(token, password) {
  try {
    sessionStorage.setItem(PORTAL_PW_STORAGE_PREFIX + token, password)
  } catch {
    // Non-fatal -- worst case the client re-enters the password on next navigation.
  }
}

/**
 * Fetches everything the client portal needs in one round trip: the
 * client's display info, deduped galleries (linked directly OR via a
 * session, never both), contracts (pending + signed, voided excluded),
 * and outstanding questionnaires. Returns null if the token doesn't match
 * any client -- callers should treat that the same as a 404.
 *
 * If the client has a portal password set, the RPC instead returns
 * { password_required: true, locked, retry_after_seconds? } until a
 * correct password has been supplied. This function automatically resends
 * any password already confirmed correct earlier in the tab session (see
 * storePortalPassword above), so most callers never see that shape after
 * the first unlock -- only the initial gate (handled by
 * PortalPasswordGate.jsx via verifyPortalPassword) and a fresh tab need to
 * care about it.
 *
 * Cached per token for the page's lifetime -- see portalDataCache comment
 * above. Gate responses are never cached, since they're not real portal
 * data and could change on the very next attempt. Pass forceRefresh=true
 * to bypass the cache (e.g. after a client submits a questionnaire or
 * signs a contract, when the portal's own data genuinely needs to reflect
 * that change rather than serve stale state).
 */
export async function getPortalData(token, forceRefresh = false) {
  const cached = portalDataCache.get(token)
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return cached.data
  }
  const storedPassword = getStoredPortalPassword(token)
  const { data, error } = await supabase.rpc('get_client_portal_data', {
    p_token: token,
    p_password: storedPassword || null,
  })
  if (error) throw error
  if (data && !data.password_required) {
    portalDataCache.set(token, { data, expiresAt: Date.now() + PORTAL_DATA_TTL_MS })
  }
  return data
}

/**
 * Submits a password attempt against a gated portal. On success, caches
 * the password for the rest of the tab session (so subsequent
 * getPortalData calls resend it automatically) and warms the data cache
 * with the now-unlocked payload. On failure, returns the RPC's gate
 * response as-is (password_required/locked/error) for the caller to
 * render -- never throws for a wrong password, only for actual request
 * failures.
 */
export async function verifyPortalPassword(token, password) {
  const { data, error } = await supabase.rpc('get_client_portal_data', {
    p_token: token,
    p_password: password,
  })
  if (error) throw error
  if (data && !data.password_required) {
    storePortalPassword(token, password)
    portalDataCache.set(token, { data, expiresAt: Date.now() + PORTAL_DATA_TTL_MS })
  }
  return data
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

export async function getOrCreateViewer(galleryId, email, displayName = null) {
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
  // Finds an existing viewer for this gallery+email server-side before
  // creating a new one, so the same person visiting from a different
  // device/browser (no localStorage entry) reconnects to their existing
  // favorites/comments/selections instead of starting a disconnected new
  // viewer identity every time.
  const { data, error } = await supabase.rpc('get_or_create_gallery_viewer', {
    p_gallery_id: galleryId,
    p_email: email,
    p_display_name: displayName,
  })
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
 * size='hires': hits the worker, ZIPs raw originals in one streamed
 *               response (worker-side, no CPU issue on our end).
 * size='web':   worker resizes + watermarks each image server-side (same
 *               pipeline as the single-image "download web-size" button),
 *               we just collect the finished bytes into a ZIP in the
 *               browser. Sequential to keep memory manageable.
 *
 * @param {string} galleryId
 * @param {string} shareToken
 * @param {string[]} imageKeys        - original_r2_key values
 * @param {string[]} fileNames        - display filenames
 * @param {string} galleryTitle
 * @param {string|null} downloadPin
 * @param {string} size               - 'web' | 'hires'
 * @param {Array<string|null>} watermarkIds - image.watermark_id values, used for the size='web' fallback path when web_key is unavailable
 * @param {Array<string|null>} webKeys - image.web_r2_key values, used for the size='web' fast path (pre-generated JPEG, skips server-side WASM processing)
 * @param {function} onProgress       - called with (current, total) after each image
 */
// Sync/async threshold for hi-res ZIP downloads (spec section 7,
// question 1, decided Aug 22, 2026): below BOTH limits, stream
// synchronously via /download-zip for instant gratification. At or
// above EITHER one, queue an async job via /zip-jobs instead --
// "whichever hits first."
export const SYNC_ZIP_MAX_IMAGES = 25
export const SYNC_ZIP_MAX_BYTES = 250 * 1024 * 1024 // 250MB

export function shouldQueueHiresZip(imageCount, totalBytes) {
  return imageCount > SYNC_ZIP_MAX_IMAGES || totalBytes > SYNC_ZIP_MAX_BYTES
}

/**
 * Queues an async hi-res ZIP job (Tier 3) instead of streaming it
 * synchronously -- used once a gallery crosses the threshold above.
 * The person gets an email at notifyEmail when it's ready instead of
 * waiting on this request. Returns { ok, jobId }.
 */
export async function queueHiresZip(shareToken, imageKeys, fileNames, notifyEmail, viewerId, downloadPin = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Share-Token': shareToken,
  }
  if (downloadPin) headers['X-Download-Pin'] = downloadPin

  const resp = await fetch(`${WORKER_URL}/zip-jobs`, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: JSON.stringify({ imageKeys, fileNames, notifyEmail, viewerId }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to queue download')
  }
  return resp.json()
}

export async function downloadZip(galleryId, shareToken, imageKeys, fileNames = [], galleryTitle = 'gallery', downloadPin = null, size = 'hires', watermarkIds = [], webKeys = [], onProgress = null) {
  if (size === 'web') {
    return downloadZipClientSide(imageKeys, fileNames, galleryTitle, shareToken, downloadPin, watermarkIds, webKeys, onProgress)
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
 * Web ZIP assembly.
 * Requests size=web per image -- the Worker resizes and watermarks
 * server-side (same pipeline the single-image "download web-size" button
 * uses), including allow_hires_download permission not applying here,
 * since size=web never returns a hi-res file regardless of that setting.
 * We just collect the already-finished bytes into a ZIP. Sequential to
 * keep peak memory to one image at a time, same as before.
 */
// Worker allows 100 req/min/IP on /download/ -- 650ms between requests
// keeps a full batch at ~92/min, under the limit with margin.
const DOWNLOAD_PACE_MS = 650
const MAX_429_RETRIES = 3

async function downloadZipClientSide(imageKeys, fileNames, galleryTitle, shareToken, downloadPin, watermarkIds, webKeys, onProgress) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const total = imageKeys.length
  let lastRequestAt = 0

  for (let i = 0; i < imageKeys.length; i++) {
    const key = imageKeys[i]
    const fileName = fileNames[i] || key.split('/').pop().replace(/\.[^.]+$/, '_web.jpg')
    const watermarkId = watermarkIds[i] || null
    const webKey = webKeys[i] || null

    try {
      const headers = { 'X-Share-Token': shareToken }
      if (downloadPin) headers['X-Download-Pin'] = downloadPin
      const params = new URLSearchParams({ size: 'web' })
      if (watermarkId) params.set('watermark_id', watermarkId)
      if (webKey) params.set('web_key', encodeURIComponent(webKey))
      const url = `${WORKER_URL}/download/${encodeURIComponent(key)}?${params}`

      let resp
      for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
        const waitMs = lastRequestAt + DOWNLOAD_PACE_MS - Date.now()
        if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
        lastRequestAt = Date.now()

        resp = await fetch(url, { headers, credentials: 'omit' })
        if (resp.status !== 429) break
        if (attempt === MAX_429_RETRIES) break

        const retryAfterSec = parseInt(resp.headers.get('Retry-After'), 10)
        const backoffMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 5000
        await new Promise(r => setTimeout(r, backoffMs))
      }
      if (!resp.ok) continue

      const blob = await resp.blob()
      zip.file(fileName, blob)
    } catch (err) {
      console.error(`Failed to fetch ${fileName}:`, err)
    }

    onProgress?.(i + 1, total)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  const safeName = galleryTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  triggerBrowserDownload(zipBlob, `${safeName}.zip`)
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
