// Public (anon) API for resolving a custom domain's root ("/") — see
// sql/035_microsite_hostname_resolution.sql. Mirrors the style of
// clientApi.js (same supabaseAnon client, same "throw on real error,
// return null-ish on not-found" shape).
import { supabaseAnon as supabase } from '../supabaseClientAnon.js'
// Authenticated client for the photographer's own read/write access to
// their microsite row — separate from the anon client above, scoped by
// the microsites_owner_all RLS policy (sql/034).
import { supabase as supabaseAuthed } from '../supabaseClient.js'

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

/**
 * Loads the current photographer's own microsite row, creating a default
 * (disabled) one on first access if none exists yet — so the editor always
 * has a real row to work with rather than needing separate create/edit
 * flows.
 */
export async function getMyMicrosite() {
  const { data: { user } } = await supabaseAuthed.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabaseAuthed
    .from('microsites')
    .select('*')
    .eq('photographer_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (data) return data

  // No microsite yet -- pre-fill what already exists on the photographer's
  // own profile (Account -> Profile) rather than starting from a blank
  // form for information they've already entered elsewhere. Deliberately
  // NOT pulling hero_image_key from logo/avatar (a logo mark isn't a hero
  // photo) or accent_color from photographers.accent_color (that field
  // isn't guaranteed to match the curated swatch palette this editor is
  // built around) -- both stay genuinely blank/default so they're a real
  // choice, not an inherited guess.
  const { data: photographer } = await supabaseAuthed
    .from('photographers')
    .select('business_name, display_name, business_email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: created, error: createError } = await supabaseAuthed
    .from('microsites')
    .insert({
      photographer_id: user.id,
      studio_name: photographer?.business_name || photographer?.display_name || null,
      contact_email: photographer?.business_email || null,
    })
    .select()
    .single()
  if (createError) throw createError
  return created
}

/**
 * Saves changes to the current photographer's microsite row. `updates` is
 * merged with the existing row server-side (a normal UPDATE), so partial
 * patches are fine.
 */
export async function updateMyMicrosite(updates) {
  const { data: { user } } = await supabaseAuthed.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data, error } = await supabaseAuthed
    .from('microsites')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('photographer_id', user.id)
    .select()
    .single()
  if (error) throw error
  return data
}
