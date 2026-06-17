import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * POST /watermark-upload
 * Stores a watermark image to R2 for the authenticated photographer.
 *
 * Form fields:
 *   file  - The watermark image (PNG recommended, supports transparency)
 *   key   - The R2 key, must be photographers/{userId}/watermarks/{filename}
 */
export async function handleWatermarkUpload(request, env, corsHeaders) {
  const auth = await verifyJWT(request)
  if (!auth.valid) {
    return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid form data' }, 400, corsHeaders)
  }

  const file = formData.get('file')
  const key  = formData.get('key')

  if (!file || !key) {
    return jsonResponse({ ok: false, error: 'Missing required fields: file, key' }, 400, corsHeaders)
  }

  if (!key.startsWith(`photographers/${auth.userId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid key prefix' }, 403, corsHeaders)
  }
  if (!key.includes('/watermarks/') && !key.includes('/logos/')) {
    return jsonResponse({ ok: false, error: 'Invalid key: must contain /watermarks/ or /logos/' }, 400, corsHeaders)
  }

  const fileType = file.type || 'image/png'
  if (!fileType.startsWith('image/')) {
    return jsonResponse({ ok: false, error: 'Only image files are allowed for watermarks' }, 400, corsHeaders)
  }

  try {
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: fileType,
        cacheControl: 'private, max-age=3600',
      },
      customMetadata: {
        photographerId: auth.userId,
        uploadedAt: new Date().toISOString(),
        type: 'watermark',
      }
    })

    return jsonResponse({ ok: true, key, size: file.size }, 200, corsHeaders)
  } catch (err) {
    console.error('R2 watermark upload error:', err)
    return jsonResponse({ ok: false, error: 'Upload failed: ' + err.message }, 500, corsHeaders)
  }
}

/**
 * GET /watermark/:key
 * Serves a watermark image.
 *
 * Accepts auth via (in order of precedence):
 *   1. JWT Authorization header — photographer accessing their own watermark
 *   2. ?token= query param — photographer via <img> tags (can't set headers)
 *   3. X-Share-Token header — client downloading from a gallery (for ZIP watermark compositing)
 *
 * For share token auth, the watermark key must belong to the gallery's photographer.
 */
export async function handleWatermarkServe(request, env, corsHeaders) {
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  const key = decodeURIComponent(url.pathname.replace(/^\/watermark\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No key provided' }, 400, corsHeaders)
  }

  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ') || queryToken
  const hasShareToken = !!request.headers.get('X-Share-Token')

  let photographerId

  if (hasJWT) {
    // Photographer access — JWT or query param token
    let auth
    if (queryToken) {
      const syntheticRequest = new Request(request.url, {
        headers: { 'Authorization': `Bearer ${queryToken}` }
      })
      auth = await verifyJWT(syntheticRequest)
    } else {
      auth = await verifyJWT(request)
    }

    if (!auth.valid) {
      return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    }
    photographerId = auth.userId

  } else if (hasShareToken) {
    // Client access via share token — no PIN required just to fetch a watermark
    const shareAuth = await verifyShareToken(request, env, false)
    if (!shareAuth.valid) {
      return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    }
    photographerId = shareAuth.photographerId

  } else {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  // Security: watermark key must belong to this photographer
  if (!key.startsWith(`photographers/${photographerId}/watermarks/`) && !key.startsWith(`photographers/${photographerId}/logos/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  try {
    const obj = await env.BUCKET.get(key)
    if (!obj) {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders)
    }

    return new Response(obj.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': obj.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'private, max-age=3600',
      }
    })
  } catch (err) {
    console.error('R2 watermark serve error:', err)
    return jsonResponse({ ok: false, error: 'Failed to serve watermark' }, 500, corsHeaders)
  }
}

/**
 * GET /logo/:key
 * Publicly serves a studio logo. No auth required.
 * Key must be under photographers/{id}/logos/ — enforced here.
 */
export async function handleLogoServe(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/logo\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No key provided' }, 400, corsHeaders)
  }

  // Only serve files stored under /logos/ — prevents this endpoint
  // from being used to serve watermarks or any other private assets
  if (!key.includes('/logos/')) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  try {
    const obj = await env.BUCKET.get(key)
    if (!obj) {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders)
    }

    return new Response(obj.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': obj.httpMetadata?.contentType || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      }
    })
  } catch (err) {
    console.error('R2 logo serve error:', err)
    return jsonResponse({ ok: false, error: 'Failed to serve logo' }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
