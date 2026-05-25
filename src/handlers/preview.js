import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * GET /preview/:key
 * Serve a watermarked WebP preview image.
 * Accessible by:
 *   - Photographer (JWT) — for dashboard preview
 *   - Client (X-Share-Token header) — for gallery view
 *
 * Preview key format:
 *   photographers/{photographerId}/galleries/{galleryId}/preview/{imageId}.webp
 *
 * Served with aggressive cache headers — previews are immutable once generated.
 */
export async function handlePreview(request, env, corsHeaders) {
  const url = new URL(request.url)
  // Strip /preview/ prefix to get the R2 key
  const key = decodeURIComponent(url.pathname.replace(/^\/preview\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No image key provided' }, 400, corsHeaders)
  }

  // Auth: accept either a JWT (photographer) or share token (client)
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
    const shareAuth = await verifyShareToken(request, env, false)
    if (!shareAuth.valid) {
      return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    }
    photographerId = shareAuth.photographerId
  }

  // Security: ensure the key belongs to this photographer
  if (!key.startsWith(`photographers/${photographerId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  try {
    const object = await env.BUCKET.get(key)
    if (!object) {
      return jsonResponse({ ok: false, error: 'Image not found' }, 404, corsHeaders)
    }

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp')
    // Aggressive caching — previews are watermarked WebP, immutable after generation
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('ETag', object.httpEtag || '')

    // Support conditional requests
    const ifNoneMatch = request.headers.get('If-None-Match')
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, { status: 304, headers })
    }

    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    console.error('R2 preview fetch error:', err)
    return jsonResponse({ ok: false, error: 'Failed to fetch image' }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
