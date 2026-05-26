import { verifyJWT } from '../middleware/auth.js'

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
  if (!key.includes('/watermarks/')) {
    return jsonResponse({ ok: false, error: 'Invalid key: must contain /watermarks/' }, 400, corsHeaders)
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
 * Serves a watermark image — authenticated photographer only.
 * Accepts token via Authorization header OR ?token= query param
 * (query param needed for <img> tags which can't set headers).
 */
export async function handleWatermarkServe(request, env, corsHeaders) {
  // Extract token from header or query param
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')

  let auth
  if (queryToken) {
    // Synthesize a request-like object with the Authorization header
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

  // Strip leading /watermark/
  const key = decodeURIComponent(url.pathname.replace(/^\/watermark\//, ''))

  if (!key.startsWith(`photographers/${auth.userId}/watermarks/`)) {
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

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
