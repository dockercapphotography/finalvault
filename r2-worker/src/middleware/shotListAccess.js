import { rpc, UUID_RE, SHARE_TOKEN_RE } from '../utils/supabase.js'

/**
 * Verifies that a preview may be shown on the public /poses/:token page:
 *   GET /preview/<key>?shot_list=<share token>[&viewer=<viewer id>]
 *
 * Allowed: approved items on that active list (client uploads, or the
 * photographer's library poses used on it), plus the visitor's own pending
 * uploads when their viewer id is passed. Nothing else -- not other lists,
 * not library poses that aren't on this list, never originals or galleries.
 * Re-checked against Supabase on every request (shot_list_key_visible), so
 * turning a list off, removing an item or rejecting an upload takes effect
 * immediately.
 */
export async function verifyShotListAccess(key, token, viewerId, env) {
  const m = /^photographers\/([0-9a-f-]{36})\/poses\//i.exec(key)
  if (!m) return { valid: false, error: 'Invalid key for shot list access' }
  if (!SHARE_TOKEN_RE.test(token || '')) return { valid: false, error: 'Invalid shot list link' }
  if (viewerId && !UUID_RE.test(viewerId)) return { valid: false, error: 'Invalid viewer' }

  try {
    const res = await rpc(env, 'shot_list_key_visible', {
      p_token: token,
      p_key: key,
      p_viewer_id: viewerId || null,
    })
    if (!res.ok) return { valid: false, error: 'Failed to validate shot list access' }
    if (res.data !== true) return { valid: false, error: 'Image is not on this shot list' }
    return { valid: true, photographerId: m[1] }
  } catch (err) {
    console.error('Shot list access verification error:', err)
    return { valid: false, error: 'Shot list access verification failed' }
  }
}
