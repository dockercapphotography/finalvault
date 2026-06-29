/**
 * GET /avatar/:key
 * Publicly serves a photographer's avatar/profile photo. No auth required.
 *
 * Real key convention, confirmed against a live row (not guessed):
 *   photographers/{id}/watermarks/avatar-{uuid}.jpg
 * Avatars share the /watermarks/ folder with actual watermark images,
 * distinguished only by an "avatar-" filename prefix. This matters for
 * the access check below: checking just "/watermarks/" the way
 * handleLogoServe checks "/logos/" would also publicly expose real
 * watermark images, which handleWatermarkServe deliberately keeps behind
 * auth (photographer JWT or gallery share token). So this endpoint checks
 * the filename prefix specifically, not just the folder, to stay a narrow
 * carve-out for avatars only.
 */
export async function handleAvatarServe(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/avatar\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No key provided' }, 400, corsHeaders)
  }

  const filename = key.split('/').pop() || ''
  if (!key.includes('/watermarks/') || !filename.startsWith('avatar-')) {
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
        'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      }
    })
  } catch (err) {
    console.error('R2 avatar serve error:', err)
    return jsonResponse({ ok: false, error: 'Failed to serve avatar' }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
