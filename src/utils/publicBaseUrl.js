import { supabase } from '../supabaseClient.js'

// Cached for the life of the page load. A photographer's custom-domain
// status isn't expected to change while they're actively using the
// dashboard, and a refresh naturally clears this if it does.
let cachedBaseUrl = null
let inFlight = null

/**
 * Base URL to use for client-facing links (gallery, booking, client portal,
 * questionnaire submit). Uses the photographer's own active custom domain
 * if one is configured (docs/custom-domains-spec.md section 3.4), falling
 * back to window.location.origin — the domain the dashboard is currently
 * loaded from — otherwise.
 *
 * Async because it's a DB lookup on first call; callers that render the URL
 * directly (rather than only using it in a click handler) should seed state
 * with window.location.origin and update it once this resolves, so there's
 * something sensible to show before the lookup completes.
 */
export async function getPublicBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return window.location.origin

      const { data, error } = await supabase
        .from('photographer_domains')
        .select('domain, status')
        .eq('photographer_id', user.id)
        .maybeSingle()

      if (error || !data || data.status !== 'active') {
        return window.location.origin
      }
      return `https://${data.domain}`
    } catch (err) {
      console.error('getPublicBaseUrl failed, falling back to window.location.origin:', err)
      return window.location.origin
    }
  })()

  cachedBaseUrl = await inFlight
  inFlight = null
  return cachedBaseUrl
}
