/**
 * download.js — unified single-image download handler
 *
 * GET /download/:key?size=web|hires&watermark_id=...
 *
 * size=hires: fetch original → serve as-is, no watermark
 * size=web:   fetch original → resize to 2048px → apply watermark → encode JPEG
 *
 * watermark_id comes from gallery_images.watermark_id — the exact watermark
 * that was baked into the preview for this image.
 */

import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'
import { fetchWatermarkById, processWebImage } from '../utils/imageProcess.js'

export async function handleDownload(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/download\//, ''))
  const size = url.searchParams.get('size') || 'web'
  const watermarkId = url.searchParams.get('watermark_id') || null

  if (!key) {
    return jsonResponse({ ok: false, error: 'No image key provided' }, 400, corsHeaders)
  }
  if (!['web', 'hires'].includes(size)) {
    return jsonResponse({ ok: false, error: 'Invalid size parameter. Use web or hires.' }, 400, corsHeaders)
  }

  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const hasShareToken = !!request.headers.get('X-Share-Token')

  if (!hasJWT && !hasShareToken) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId

  if (hasJWT) {
    const auth = await verifyJWT(request)
    if (!auth.valid) {
      return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    }
    photographerId = auth.userId
  } else {
    const shareAuth = await verifyShareToken(request, env, true)
    if (!shareAuth.valid) {
      return jsonResponse(
        { ok: false, error: shareAuth.error, needsPin: shareAuth.needsPin },
        403,
        corsHeaders
      )
    }
    if (!shareAuth.allowDownloads) {
      return jsonResponse(
        { ok: false, error: 'Downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }
    if (size === 'hires' && !shareAuth.allowHiresDownload) {
      return jsonResponse(
        { ok: false, error: 'High resolution downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }
    photographerId = shareAuth.photographerId
  }

  // Security: key must belong to this photographer's originals
  if (!key.startsWith(`photographers/${photographerId}/`) || !key.includes('/original/')) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  let originalObj
  try {
    originalObj = await env.BUCKET.get(key)
  } catch (err) {
    console.error('R2 fetch error:', err)
    return jsonResponse({ ok: false, error: 'Failed to fetch file' }, 500, corsHeaders)
  }
  if (!originalObj) {
    return jsonResponse({ ok: false, error: 'File not found' }, 404, corsHeaders)
  }

  const originalFileName = key.split('/').pop() || 'download'

  // --- HIRES: serve original as-is ---
  if (size === 'hires') {
    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', originalObj.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Content-Disposition', `attachment; filename="${originalFileName}"`)
    headers.set('Cache-Control', 'private, no-cache')
    return new Response(originalObj.body, { status: 200, headers })
  }

  // --- WEB: resize + watermark + JPEG ---
  try {
    const inputBytes = new Uint8Array(await originalObj.arrayBuffer())

    // Look up the watermark that was baked into this image's preview
    const wmConfig = watermarkId ? await fetchWatermarkById(watermarkId, env) : null

    const jpegBytes = await processWebImage(inputBytes, wmConfig)
    const webFileName = originalFileName.replace(/\.[^.]+$/, '_web.jpg')

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'image/jpeg')
    headers.set('Content-Disposition', `attachment; filename="${webFileName}"`)
    headers.set('Content-Length', jpegBytes.byteLength.toString())
    headers.set('Cache-Control', 'private, no-cache')

    return new Response(jpegBytes, { status: 200, headers })
  } catch (err) {
    console.error('Web image processing error:', err)
    return jsonResponse({ ok: false, error: 'Image processing failed: ' + err.message }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
