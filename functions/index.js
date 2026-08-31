// Cloudflare Pages Function — intercepts requests to "/" on custom
// domains and rewrites the HTML <head> with photographer-specific SEO
// meta tags (title, description, Open Graph, Twitter Card) before any
// JavaScript runs.
//
// Why this has to happen here and not in React: the microsite already
// sets document.title dynamically via a useEffect, which looks correct
// in a browser after the page loads. But most social crawlers (Facebook
// in particular, generally Instagram/iMessage/SMS preview generators
// too) don't execute JavaScript when fetching a URL to build a share
// preview -- they read the raw HTML response. A useEffect-based
// approach would silently fail at the one thing this feature exists
// for: looking correct in a browser while the actual share card stays
// blank or generic.
//
// Requires a VITE_SUPABASE_PUBLISHABLE_KEY environment variable set on
// this Cloudflare Pages project (Settings → Environment variables) --
// separate from the Vite build-time env vars, since this runs as a
// server-side Function at request time, not baked into the frontend
// bundle.

const SUPABASE_URL = 'https://imukbaawmtmctfqchxdx.supabase.co'
const R2_WORKER_URL = 'https://finalvault-worker.sitranephotography.workers.dev'

function truncate(text, max) {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

class HeadRewriter {
  constructor(seo) {
    this.seo = seo
  }
  element(element) {
    const { title, description, imageUrl, pageUrl } = this.seo

    if (title) {
      element.append(`<title>${escapeHtml(title)}</title>`, { html: true })
      element.append(`<meta property="og:title" content="${escapeHtml(title)}">`, { html: true })
      element.append(`<meta name="twitter:title" content="${escapeHtml(title)}">`, { html: true })
    }
    if (description) {
      element.append(`<meta name="description" content="${escapeHtml(description)}">`, { html: true })
      element.append(`<meta property="og:description" content="${escapeHtml(description)}">`, { html: true })
      element.append(`<meta name="twitter:description" content="${escapeHtml(description)}">`, { html: true })
    }
    element.append(`<meta property="og:type" content="website">`, { html: true })
    element.append(`<meta name="twitter:card" content="summary_large_image">`, { html: true })
    if (imageUrl) {
      element.append(`<meta property="og:image" content="${escapeHtml(imageUrl)}">`, { html: true })
      element.append(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`, { html: true })
    }
    if (pageUrl) {
      element.append(`<meta property="og:url" content="${escapeHtml(pageUrl)}">`, { html: true })
    }
  }
}

export async function onRequestGet(context) {
  const { request, env, next } = context
  const url = new URL(request.url)
  // Custom-domain traffic passes through saas-proxy-worker, which
  // rewrites the request's actual hostname to *.pages.dev before it
  // ever reaches this Function -- X-Forwarded-Host carries the real
  // original hostname through that hop. Falls back to url.hostname for
  // requests that never went through the proxy at all (direct
  // final-vault.app / *.pages.dev traffic).
  const hostname = request.headers.get('X-Forwarded-Host') || url.hostname

  // The app's own domains never serve a microsite at "/" -- that's the
  // dashboard/login. Skip the lookup entirely for those.
  if (hostname === 'final-vault.app' || hostname.endsWith('.pages.dev')) {
    return next()
  }

  const response = await next()

  // Only rewrite actual HTML responses -- guards against this somehow
  // matching an asset request rather than the SPA shell.
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    return response
  }

  let site
  try {
    const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_site_by_hostname`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ p_hostname: hostname }),
    })
    site = await rpcRes.json()
  } catch (err) {
    // Lookup failure falls through to the unmodified response rather
    // than breaking the page for a real visitor.
    return response
  }

  if (!site || site.type !== 'microsite') {
    return response
  }

  const title = site.studio_name || 'Photography'
  const description = truncate(
    site.about_subheading || site.tagline || site.bio || `Professional photography by ${title}`,
    160
  )
  const imageUrl = site.hero_image_key
    ? `${R2_WORKER_URL}/microsite-hero/${encodeURIComponent(site.hero_image_key)}`
    : null

  const rewriter = new HTMLRewriter().on('head', new HeadRewriter({
    title,
    description,
    imageUrl,
    pageUrl: url.toString(),
  }))

  return rewriter.transform(response)
}
