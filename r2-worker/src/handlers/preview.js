import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * GET /preview/:key
 * Serve a watermarked WebP preview image.
 * Accessible by:
 *   - Photographer (JWT via Authorization header)
 *   - Client (X-Share-Token header OR ?share_token= query param)
 */
export async function handlePreview(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/preview\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No image key provided' }, 400, corsHeaders)
  }

  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const hasShareHeader = !!request.headers.get('X-Share-Token')
  const queryShareToken = url.searchParams.get('share_token')

  if (!hasJWT && !hasShareHeader && !queryShareToken) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId

  if (hasJWT) {
    const auth = await verifyJWT(request)
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    photographerId = auth.userId
  } else {
    // Support share token from either header or query param
    const tokenRequest = queryShareToken
      ? new Request(request.url, {
          ...request,
          headers: { ...Object.fromEntries(request.headers), 'X-Share-Token': queryShareToken }
        })
      : request

    const shareAuth = await verifyShareToken(tokenRequest, env, false)
    if (!shareAuth.valid) return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    photographerId = shareAuth.photographerId
  }

  if (!key.startsWith(`photographers/${photographerId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  try {
    const object = await env.BUCKET.get(key)
    if (!object) return jsonResponse({ ok: false, error: 'Image not found' }, 404, corsHeaders)

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('ETag', object.httpEtag || '')

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
