import pathlib

path = pathlib.Path("src/utils/crmApi.js")
src = path.read_text()

old = """export async function regeneratePortalToken(clientId) {
  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('clients')
    .update({ portal_token: token, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('portal_token')
    .single()
  if (error) throw error
  return data.portal_token
}
"""

assert src.count(old) == 1, "anchor not found or not unique"

new = old + """
/**
 * Sets (or changes) the password gating a client's portal access. Runs
 * through the set_client_portal_password RPC, which hashes server-side via
 * pgcrypto and verifies photographer ownership before writing -- never
 * hashes client-side and never returns the hash to the caller. Also resets
 * any existing lockout state, since a new password invalidates whatever the
 * old lockout was protecting.
 */
export async function setClientPortalPassword(clientId, password) {
  const { data, error } = await supabase.rpc('set_client_portal_password', {
    p_client_id: clientId,
    p_password: password,
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error === 'not_authorized' ? 'Not authorized to update this client.' : 'Failed to set portal password.')
  return data
}

/**
 * Removes portal password protection entirely, reverting the client's
 * portal link to token-only access. Same RPC as setClientPortalPassword --
 * passing an empty password clears the gate instead of setting one.
 */
export async function clearClientPortalPassword(clientId) {
  return setClientPortalPassword(clientId, '')
}

/**
 * Manually clears a client's portal lockout state (failed attempt counter
 * and any active escalating-delay window). This is the photographer's
 * escape hatch for a client who's genuinely locked out and can't wait --
 * time-based decay handles the rest on its own.
 */
export async function resetPortalLockout(clientId) {
  const { error } = await supabase
    .from('clients')
    .update({
      portal_password_attempts: 0,
      portal_password_locked_until: null,
      portal_password_last_attempt_at: null,
    })
    .eq('id', clientId)
  if (error) throw error
}
"""

src = src.replace(old, new)
path.write_text(src)
print("Patched crmApi.js successfully")
