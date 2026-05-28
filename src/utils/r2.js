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

/**
 * Fetch a preview image as an object URL for display in <img>.
 * cacheBust: optional string appended as ?t=... to force a fresh fetch after re-watermark.
 */
export async function fetchPreviewObjectUrl({ key, shareToken, token, cacheBust }) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (shareToken) headers['X-Share-Token'] = shareToken

  const bust = cacheBust ? `?t=${cacheBust}` : ''
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(key)}${bust}`, { headers })
  if (!resp.ok) throw new Error('Failed to fetch preview')

  const blob = await resp.blob()
  return URL.createObjectURL(blob)
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
