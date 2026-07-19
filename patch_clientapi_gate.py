import pathlib

path = pathlib.Path("src/utils/clientApi.js")
src = path.read_text()

old_cache_and_fetch = '''const PORTAL_DATA_TTL_MS = 30_000
const portalDataCache = new Map() // token -> { data, expiresAt }

/**
 * Fetches everything the client portal needs in one round trip: the
 * client's display info, deduped galleries (linked directly OR via a
 * session, never both), contracts (pending + signed, voided excluded),
 * and outstanding questionnaires. Returns null if the token doesn't match
 * any client -- callers should treat that the same as a 404.
 *
 * Cached per token for the page's lifetime -- see portalDataCache comment
 * above. Pass forceRefresh=true to bypass the cache (e.g. after a client
 * submits a questionnaire or signs a contract, when the portal's own data
 * genuinely needs to reflect that change rather than serve stale state).
 */
export async function getPortalData(token, forceRefresh = false) {
  const cached = portalDataCache.get(token)
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return cached.data
  }
  const { data, error } = await supabase.rpc('get_client_portal_data', { p_token: token })
  if (error) throw error
  portalDataCache.set(token, { data, expiresAt: Date.now() + PORTAL_DATA_TTL_MS })
  return data
}'''

assert src.count(old_cache_and_fetch) == 1, "cache/getPortalData anchor not found or not unique"

new_cache_and_fetch = '''const PORTAL_DATA_TTL_MS = 30_000
const portalDataCache = new Map() // token -> { data, expiresAt }

// Some clients now have an optional password gating their portal, checked
// server-side inside get_client_portal_data itself (see FinalVault handoff
// notes) -- the RPC has no notion of a session, so the correct password
// has to be resent on every call, not just the first one. sessionStorage
// (not localStorage) holds it for the tab's lifetime: long enough that
// navigating between portal sections doesn't re-prompt, short enough that
// closing the tab re-gates, which matters more here than for a typical
// login since this password guards contracts and gallery access codes.
const PORTAL_PW_STORAGE_PREFIX = 'fv-portal-pw-'

function getStoredPortalPassword(token) {
  try {
    return sessionStorage.getItem(PORTAL_PW_STORAGE_PREFIX + token)
  } catch {
    return null // sessionStorage can throw in some privacy modes -- treat as "no password on hand"
  }
}

function storePortalPassword(token, password) {
  try {
    sessionStorage.setItem(PORTAL_PW_STORAGE_PREFIX + token, password)
  } catch {
    // Non-fatal -- worst case the client re-enters the password on next navigation.
  }
}

/**
 * Fetches everything the client portal needs in one round trip: the
 * client's display info, deduped galleries (linked directly OR via a
 * session, never both), contracts (pending + signed, voided excluded),
 * and outstanding questionnaires. Returns null if the token doesn't match
 * any client -- callers should treat that the same as a 404.
 *
 * If the client has a portal password set, the RPC instead returns
 * { password_required: true, locked, retry_after_seconds? } until a
 * correct password has been supplied. This function automatically resends
 * any password already confirmed correct earlier in the tab session (see
 * storePortalPassword above), so most callers never see that shape after
 * the first unlock -- only the initial gate (handled by
 * PortalPasswordGate.jsx via verifyPortalPassword) and a fresh tab need to
 * care about it.
 *
 * Cached per token for the page's lifetime -- see portalDataCache comment
 * above. Gate responses are never cached, since they're not real portal
 * data and could change on the very next attempt. Pass forceRefresh=true
 * to bypass the cache (e.g. after a client submits a questionnaire or
 * signs a contract, when the portal's own data genuinely needs to reflect
 * that change rather than serve stale state).
 */
export async function getPortalData(token, forceRefresh = false) {
  const cached = portalDataCache.get(token)
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return cached.data
  }
  const storedPassword = getStoredPortalPassword(token)
  const { data, error } = await supabase.rpc('get_client_portal_data', {
    p_token: token,
    p_password: storedPassword || null,
  })
  if (error) throw error
  if (data && !data.password_required) {
    portalDataCache.set(token, { data, expiresAt: Date.now() + PORTAL_DATA_TTL_MS })
  }
  return data
}

/**
 * Submits a password attempt against a gated portal. On success, caches
 * the password for the rest of the tab session (so subsequent
 * getPortalData calls resend it automatically) and warms the data cache
 * with the now-unlocked payload. On failure, returns the RPC's gate
 * response as-is (password_required/locked/error) for the caller to
 * render -- never throws for a wrong password, only for actual request
 * failures.
 */
export async function verifyPortalPassword(token, password) {
  const { data, error } = await supabase.rpc('get_client_portal_data', {
    p_token: token,
    p_password: password,
  })
  if (error) throw error
  if (data && !data.password_required) {
    storePortalPassword(token, password)
    portalDataCache.set(token, { data, expiresAt: Date.now() + PORTAL_DATA_TTL_MS })
  }
  return data
}'''

src = src.replace(old_cache_and_fetch, new_cache_and_fetch)
path.write_text(src)
print("Patched clientApi.js with portal password gate support")
