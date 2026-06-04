/**
 * r2.js — All communication with the finalvault-worker.
 *
 * Simple cloud-only model:
 *   - Originals and previews both upload via POST /upload
 *   - Client generates the preview (resize + watermark) before uploading
 *   - No local storage, no sync, no offline support
 */

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

export function buildOriginalKey(photographerId, galleryId, imageId, ext) {
  return `photographers/${photographerId}/galleries/${galleryId}/original/${imageId}.${ext}`
}

export function buildPreviewKey(photographerId, galleryId, imageId) {
  return `photographers/${photographerId}/galleries/${galleryId}/preview/${imageId}.webp`
}

export async function uploadToR2({ file, key, token }) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('key', key)

  const resp = await fetch(`${WORKER_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  })

  const data = await resp.json()
  if (!data.ok) throw new Error(data.error || 'Upload failed')
  return data
}

export async function deleteFromR2({ key, token }) {
  const resp = await fetch(`${WORKER_URL}/delete/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })

  const data = await resp.json()
  if (!data.ok) throw new Error(data.error || 'Delete failed')
  return data
}

export function getPreviewUrl(key) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}`
}

// Module-level cache: maps "key::cacheBust" → blob object URL.
// Survives re-renders and re-mounts. Keyed by cacheBust (updated_at) so a
// re-watermarked image gets a fresh fetch while unchanged images are served instantly.
const previewBlobCache = new Map()
const previewFetchInFlight = new Map()

/**
 * Fetch a preview image as an object URL for display in <img>.
 * cacheBust: optional string — changes when image is re-watermarked (updated_at).
 * Results are cached in memory so re-renders never hit R2 twice for the same image.
 */
export async function fetchPreviewObjectUrl({ key, shareToken, token, cacheBust }) {
  const cacheKey = `${key}::${cacheBust || 'none'}`

  // Return cached blob URL if available
  if (previewBlobCache.has(cacheKey)) {
    return previewBlobCache.get(cacheKey)
  }

  // Deduplicate in-flight requests for the same key
  if (previewFetchInFlight.has(cacheKey)) {
    return previewFetchInFlight.get(cacheKey)
  }

  const fetchPromise = (async () => {
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (shareToken) headers['X-Share-Token'] = shareToken

    const bust = cacheBust ? `?t=${encodeURIComponent(cacheBust)}` : ''
    const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(key)}${bust}`, { headers })
    if (!resp.ok) throw new Error('Failed to fetch preview')

    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    previewBlobCache.set(cacheKey, objectUrl)
    previewFetchInFlight.delete(cacheKey)
    return objectUrl
  })()

  previewFetchInFlight.set(cacheKey, fetchPromise)
  return fetchPromise
}

// Call this after a re-watermark to bust the cache for a specific key
export function bustPreviewCache(key) {
  for (const cacheKey of previewBlobCache.keys()) {
    if (cacheKey.startsWith(key + '::')) {
      URL.revokeObjectURL(previewBlobCache.get(cacheKey))
      previewBlobCache.delete(cacheKey)
    }
  }
}

export async function downloadOriginal({ key, shareToken, downloadPin, token }) {
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else if (shareToken) {
    headers['X-Share-Token'] = shareToken
    if (downloadPin) headers['X-Download-Pin'] = downloadPin
  }

  const resp = await fetch(`${WORKER_URL}/original/${encodeURIComponent(key)}`, { headers })

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    const err = new Error(data.error || 'Download failed')
    err.needsPin = data.needsPin
    throw err
  }

  const blob = await resp.blob()
  const fileName = key.split('/').pop() || 'download'
  triggerDownload(blob, fileName)
}

export async function downloadGalleryZip({ galleryId, imageKeys, shareToken, downloadPin }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Share-Token': shareToken
  }
  if (downloadPin) headers['X-Download-Pin'] = downloadPin

  const resp = await fetch(`${WORKER_URL}/download-zip`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ galleryId, imageKeys })
  })

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    const err = new Error(data.error || 'ZIP download failed')
    err.needsPin = data.needsPin
    throw err
  }

  const blob = await resp.blob()
  triggerDownload(blob, `gallery-${galleryId}.zip`)
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
