// Public (anon) API for resolving a custom domain's root ("/") — see
// sql/035_microsite_hostname_resolution.sql. Mirrors the style of
// clientApi.js (same supabaseAnon client, same "throw on real error,
// return null-ish on not-found" shape).
import { supabaseAnon as supabase } from '../supabaseClientAnon.js'

/**
 * Resolves a hostname to what should render at "/" on a photographer's
 * custom domain: an enabled microsite, an auto-generated placeholder, or
 * "not_found" for an unrecognized/inactive domain.
 *
 * Returns { type: 'microsite', ... } | { type: 'placeholder', ... } | { type: 'not_found' }
 */
export async function getSiteByHostname(hostname) {
  const { data, error } = await supabase.rpc('get_site_by_hostname', {
    p_hostname: hostname,
  })
  if (error) {
    console.error('getSiteByHostname failed:', error)
    return { type: 'not_found' }
  }
  return data || { type: 'not_found' }
}
