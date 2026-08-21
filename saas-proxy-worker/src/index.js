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
    url.hostname = PAGES_ORIGIN
    const proxied = new Request(url.toString(), request)
    return fetch(proxied)
  },
}
