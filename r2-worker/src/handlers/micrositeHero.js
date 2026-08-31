/**
 * GET /microsite-hero/:key
 * Publicly serves an image ONLY if it is the current hero_image_key of a
 * live, enabled microsite. No auth required -- but the access check below
 * is the entire security boundary, so it must stay an EXACT match against
 * that specific column, re-verified on every single request. Never loosen
 * this to a prefix or folder check (unlike /logo/ and /avatar/, which key
 * off folder conventions) -- gallery folders sit right next to this same
 * photographer's private client work, so a loose match here would expose
 * far more than intended.
 *
 * The image itself is already intentionally public: it's the exact photo
 * shown to every visitor on the live microsite. This endpoint doesn't
 * expose anything a visitor couldn't already see by visiting the site.
 */
export async function handleMicrositeHeroServe(request, env, corsHeaders) {
  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/microsite-hero\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No key provided' }, 400, corsHeaders)
  }

  try {
    const checkUrl = `${env.SUPABASE_URL}/rest/v1/microsites?select=id&hero_image_key=eq.${encodeURIComponent(key)}&enabled=eq.true&limit=1`
    const checkRes = await fetch(checkUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })
    const rows = await checkRes.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders)
    }

    const obj = await env.BUCKET.get(key)
    if (!obj) {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, corsHeaders)
    }

    return new Response(obj.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      }
    })
  } catch (err) {
    console.error('R2 microsite-hero serve error:', err)
    return jsonResponse({ ok: false, error: 'Failed to serve image' }, 500, corsHeaders)
  }
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
