// Fallback origin for Cloudflare for SaaS custom hostnames (see
// docs/custom-domains-spec.md and the Phase 1 build notes for context).
//
// Cloudflare Pages rejects requests whose Host header doesn't match one of
// its own configured custom domains -- it has no way to know about
// photographers' custom domains (e.g. book.janesmithphotography.com), which
// only exist as Cloudflare-for-SaaS Custom Hostnames on this zone, not as
// Pages custom domains. Pointing the SaaS fallback origin straight at Pages
// therefore times out (522) for any hostname other than final-vault.app
// itself.
//
// This Worker is the documented fix: it sits as the actual fallback origin
// (an originless DNS record + a zone-wide Worker Route), and forwards every
// request -- regardless of which hostname it arrived on -- to the Pages
// deployment's own *.pages.dev hostname, which Pages always accepts. Since
// FinalVault's own routing is entirely token-based (no code cares which
// domain served the request), this is purely a network-level bridge; no
// app logic runs here.

const PAGES_ORIGIN = 'finalvault.pages.dev'

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const originalHostname = url.hostname
    url.hostname = PAGES_ORIGIN

    const proxied = new Request(url.toString(), request)

    // Preserve the original hostname the request actually arrived on --
    // once url.hostname is rewritten above, that information is gone
    // from the outgoing request's URL/Host header entirely. Downstream
    // consumers (e.g. the SEO Pages Function, which needs to know which
    // photographer's custom domain this is) read this header instead.
    proxied.headers.set('X-Forwarded-Host', originalHostname)

    // Every custom domain's traffic collapses onto this one *.pages.dev
    // URL once url.hostname is rewritten above -- so Cloudflare's edge
    // cache, keyed on that rewritten URL, has no way to tell
    // photographers' domains apart for a shared path like "/". Left on
    // default caching behavior, a document response cached from one
    // photographer's "/" request (whether stale after a new deploy, or
    // simply the wrong photographer's SEO-rewritten HTML) could get
    // served to a visitor on a completely different custom domain.
    // Bypass the edge cache specifically for document navigations (the
    // HTML shell); hashed static assets (/assets/*.js, *.css) are left
    // alone and keep Cloudflare Pages' normal long-lived immutable
    // caching -- their filenames already change on every build, so
    // there's no staleness risk there to begin with.
    const isDocumentRequest = request.headers.get('sec-fetch-dest') === 'document'
      || (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html'))

    return fetch(proxied, isDocumentRequest ? { cf: { cacheTtl: 0, cacheEverything: false } } : {})
  },
}
