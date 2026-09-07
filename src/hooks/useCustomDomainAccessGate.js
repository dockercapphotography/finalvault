import { useEffect } from 'react'
import { isAppHost } from '../utils/isAppHost.js'
import { supabaseAnon } from '../supabaseClientAnon.js'

// When a photographer's tier no longer includes premium features
// (Custom Domain + Microsite, gated together as one combined feature --
// see 080_premium_feature_tier_gating.sql), every page reached via
// their custom domain redirects to the equivalent final-vault.app URL
// instead of rendering -- same path and query string, just the real
// domain: studio.example.com/g/abc123 -> final-vault.app/g/abc123.
//
// This means every existing client-facing link a photographer already
// sent out (gallery, booking, portal, contract, questionnaire) keeps
// working after a downgrade, just without their custom branding -- only
// the custom domain itself, and by extension the microsite (which can't
// exist without one), actually stop working. The one exception: the
// microsite root ("/") has no equivalent page on the main app, so it
// lands on /login -- not ideal, but a reasonable non-broken fallback
// for a link that genuinely shouldn't work anymore.
//
// Silent no-op both on the real app host (nothing to gate) and when the
// hostname isn't a recognized custom domain at all (see
// get_domain_premium_access's own comment) -- only fires for a real,
// configured custom domain that has lost entitlement.
//
// Uses a real browser navigation (window.location.href), not React
// Router -- this is a genuine cross-origin move to a different domain,
// not client-side routing within the same app instance.
export function useCustomDomainAccessGate() {
  useEffect(() => {
    if (isAppHost()) return

    let cancelled = false
    supabaseAnon.rpc('get_domain_premium_access', { p_hostname: window.location.hostname })
      .then(({ data: hasAccess, error }) => {
        if (cancelled || error) return
        if (hasAccess === false) {
          window.location.href = `https://final-vault.app${window.location.pathname}${window.location.search}`
        }
      })

    return () => { cancelled = true }
  }, [])
}
