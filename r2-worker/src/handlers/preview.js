import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * GET /preview/:key
 * Serve a watermarked WebP preview image.
 * Accessible by:
 *   - Photographer (JWT via Authorization header OR ?token= query param for <img> tags)
 *   - Client (X-Share-Token header OR ?share_token= query param)
 */
export async function handlePreview(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/preview\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No image key provided' }, 400, corsHeaders)
  }

  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const queryToken = url.searchParams.get('token')           // JWT via query param (for <img> tags)
  const hasShareHeader = !!request.headers.get('X-Share-Token')
  const queryShareToken = url.searchParams.get('share_token')

  if (!hasJWT && !queryToken && !hasShareHeader && !queryShareToken) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId

  if (hasJWT || queryToken) {
    // Photographer access — JWT from header or query param
    const authRequest = queryToken
      ? new Request(request.url, { headers: { 'Authorization': `Bearer ${queryToken}` } })
      : request
    const auth = await verifyJWT(authRequest)
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    photographerId = auth.userId
  } else {
    // Client access — share token from header or query param
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
    headers.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400')
    headers.set('ETag', object.httpEtag || '')

    // Derive a download filename from the R2 key, forcing .jpg extension
    // so mobile browsers (especially iOS Safari) don't save as .webp
    const rawName = key.split('/').pop() || 'image'
    const friendlyName = rawName.replace(/\.[^.]+$/, '_web.jpg')
    headers.set('Content-Disposition', `inline; filename="${friendlyName}"`)

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
