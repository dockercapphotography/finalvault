/**
 * R2 helpers — all communication with the finalvault-worker.
 * Components never call these directly; use imageApi.js or clientApi.js instead.
 */

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Upload an original image file to R2.
 * Called during photographer image upload flow.
 */
export async function uploadOriginalToR2({ file, galleryId, imageId, token }) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('galleryId', galleryId)
  formData.append('imageId', imageId)

  const resp = await fetch(`${WORKER_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  })

  const data = await resp.json()
  if (!data.ok) throw new Error(data.error || 'Upload failed')
  return data
}

/**
 * Delete an image from R2 (removes both original and preview).
 * Called during photographer image delete flow.
 */
export async function deleteFromR2({ key, token }) {
  const resp = await fetch(`${WORKER_URL}/delete/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })

  const data = await resp.json()
  if (!data.ok) throw new Error(data.error || 'Delete failed')
  return data
}

/**
 * Build a URL to serve a watermarked preview image.
 * Used in <img src> tags throughout the app.
 */
export function getPreviewUrl({ key, shareToken, token }) {
  const encodedKey = encodeURIComponent(key)
  const url = new URL(`${WORKER_URL}/preview/${encodedKey}`)
  return url.toString()
}

/**
 * Build headers for fetching a preview image.
 * Pass either a JWT (photographer) or share token (client).
 */
export function getPreviewHeaders({ shareToken, token }) {
  if (token) return { Authorization: `Bearer ${token}` }
  if (shareToken) return { 'X-Share-Token': shareToken }
  return {}
}

/**
 * Download a single original file.
 * Triggers browser download via anchor click.
 */
export async function downloadOriginal({ key, shareToken, downloadPin, token, fileName }) {
  const headers = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else if (shareToken) {
    headers['X-Share-Token'] = shareToken
    if (downloadPin) headers['X-Download-Pin'] = downloadPin
  }

  const encodedKey = encodeURIComponent(key)
  const resp = await fetch(`${WORKER_URL}/original/${encodedKey}`, { headers })

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error(data.error || 'Download failed')
  }

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || key.split('/').pop()
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Download all gallery images as a ZIP.
 * Requires share token + optional PIN.
 */
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gallery-${galleryId}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
