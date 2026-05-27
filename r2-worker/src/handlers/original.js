import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * GET /original/:key
 * Serve the original full-quality file.
 * Accessible by:
 *   - Photographer (JWT) — always
 *   - Client (X-Share-Token + optional X-Download-Pin) — only if gallery allows downloads
 *
 * Original key format:
 *   photographers/{photographerId}/galleries/{galleryId}/original/{imageId}.{ext}
 *
 * Served with content-disposition: attachment to trigger download.
 */
export async function handleOriginal(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/original\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No image key provided' }, 400, corsHeaders)
  }

  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const hasShareToken = !!request.headers.get('X-Share-Token')

  if (!hasJWT && !hasShareToken) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId
  let isClientDownload = false
  let downloadWatermarked = false

  if (hasJWT) {
    // Photographer accessing their own original
    const auth = await verifyJWT(request)
    if (!auth.valid) {
      return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    }
    photographerId = auth.userId
  } else {
    // Client download — requires share token and optional PIN
    const shareAuth = await verifyShareToken(request, env, true)
    if (!shareAuth.valid) {
      const status = shareAuth.needsPin ? 403 : 403
      return jsonResponse({ ok: false, error: shareAuth.error, needsPin: shareAuth.needsPin }, status, corsHeaders)
    }
    if (!shareAuth.allowDownloads) {
      return jsonResponse({ ok: false, error: 'Downloads are not enabled for this gallery' }, 403, corsHeaders)
    }
    photographerId = shareAuth.photographerId
    isClientDownload = true
    downloadWatermarked = shareAuth.downloadWatermarked
  }

  // Security: ensure the key belongs to this photographer
  if (!key.startsWith(`photographers/${photographerId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  // X-Hires header means client explicitly wants the original — skip watermark swap
  const hiresRequested = request.headers.get('X-Hires') === 'true'

  // If gallery is set to watermarked downloads, serve the preview instead
  const fetchKey = (isClientDownload && downloadWatermarked && !hiresRequested)
    ? key.replace('/original/', '/preview/').replace(/\.[^.]+$/, '.webp')
    : key

  try {
    const object = await env.BUCKET.get(fetchKey)
    if (!object) {
      return jsonResponse({ ok: false, error: 'File not found' }, 404, corsHeaders)
    }

    const fileName = key.split('/').pop() || 'download'
    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`)
    // No aggressive caching for downloads — force fresh fetch
    headers.set('Cache-Control', 'private, no-cache')

    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    console.error('R2 original fetch error:', err)
    return jsonResponse({ ok: false, error: 'Failed to fetch file' }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
