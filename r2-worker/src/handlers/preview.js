import { verifyJWT } from '../middleware/auth.js'
import { verifyShareToken } from '../middleware/shareToken.js'
import { verifyMicrositeAccess } from '../middleware/micrositeAccess.js'
import { verifyBookingCoverAccess } from '../middleware/bookingCoverAccess.js'

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
  // Narrow carve-out for the client portal's cover thumbnails -- lets an
  // expired gallery's preview still render as a (dimmed, grayscale on the
  // frontend) memory cue, without loosening expiry for any other preview
  // caller. Real photo access (downloads, zips, the actual /g/:token
  // gallery view) is untouched -- this only ever reaches verifyShareToken,
  // never original.js or zip.js.
  const allowExpiredPreview = url.searchParams.get('allow_expired') === '1'

  // Public microsite request -- no client-supplied secret. Legitimacy is
  // verified entirely server-side by verifyMicrositeAccess() against
  // whether this exact key belongs to a currently-enabled microsite
  // (hero image, gallery source, or a testimonial photo). Deliberately
  // separate from the share-token path above: reusing a gallery's own
  // share_token here would leak full private-gallery access (including a
  // password-gate bypass) to anyone viewing the public site.
  const isMicrositeRequest = url.searchParams.get('microsite') === '1'

  // Public booking-page cover-photo request -- same no-client-secret model
  // as isMicrositeRequest above, just verified against signup_pages'
  // cover_image_r2_key + is_active instead of a microsite's fields. See
  // verifyBookingCoverAccess() for the exact check.
  const isBookingCoverRequest = url.searchParams.get('booking_cover') === '1'

  if (!hasJWT && !queryToken && !hasShareHeader && !queryShareToken && !isMicrositeRequest && !isBookingCoverRequest) {
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
  } else if (hasShareHeader || queryShareToken) {
    // Client access — share token from header or query param
    const tokenRequest = queryShareToken
      ? new Request(request.url, {
          ...request,
          headers: { ...Object.fromEntries(request.headers), 'X-Share-Token': queryShareToken }
        })
      : request

    const shareAuth = await verifyShareToken(tokenRequest, env, false, allowExpiredPreview)
    if (!shareAuth.valid) return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    photographerId = shareAuth.photographerId
  } else if (isMicrositeRequest) {
    // Public microsite access
    const micrositeAuth = await verifyMicrositeAccess(key, env)
    if (!micrositeAuth.valid) return jsonResponse({ ok: false, error: micrositeAuth.error }, 403, corsHeaders)
    photographerId = micrositeAuth.photographerId
  } else {
    // Public booking-page cover-photo access
    const coverAuth = await verifyBookingCoverAccess(key, env)
    if (!coverAuth.valid) return jsonResponse({ ok: false, error: coverAuth.error }, 403, corsHeaders)
    photographerId = coverAuth.photographerId
  }

  if (!key.startsWith(`photographers/${photographerId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  try {
    const object = await env.BUCKET.get(key)
    if (!object) return jsonResponse({ ok: false, error: 'Image not found' }, 404, corsHeaders)

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp')
    // Public, unauthenticated-legitimacy requests (a microsite's own
    // gallery/hero/testimonial photos, a booking page's cover photo) are
    // identical for every visitor -- nothing here is scoped to who's
    // asking, verification only checks whether the key legitimately
    // belongs to a currently-enabled/active public page. The photographer-
    // JWT and share-token branches genuinely are viewer-scoped and stay
    // private. Marking every branch `private` (the prior blanket setting)
    // meant Cloudflare's edge could never cache the public ones: every
    // visitor to a microsite triggered a fresh Supabase verification
    // round-trip *and* R2 fetch for every image on the page, every time.
    const isPublicRequest = isMicrositeRequest || isBookingCoverRequest
    headers.set(
      'Cache-Control',
      isPublicRequest
        ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
        : 'private, max-age=3600, stale-while-revalidate=86400'
    )
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
