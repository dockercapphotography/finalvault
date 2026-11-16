/**
 * Verify a Supabase access token (JWT) and return the signed-in user's id.
 * Used for every photographer-authenticated worker request.
 *
 *   const auth = await verifyJWT(request, env)
 *   if (!auth.valid) -> 401 with auth.error
 *   auth.userId      -> the photographer's id (the token's `sub`)
 *
 * Until Nov 2026 this only decoded the token and checked its expiry, so a
 * hand-made token with any photographer's id was accepted. It now checks the
 * signature, three ways depending on how the project signs tokens:
 *
 *   ES256 / RS256 (Supabase JWT signing keys): verified locally against the
 *     project's public keys from /auth/v1/.well-known/jwks.json (cached).
 *   HS256 (legacy shared secret): verified locally when the worker has the
 *     SUPABASE_JWT_SECRET secret; otherwise asked of Supabase Auth itself
 *     (/auth/v1/user), and a confirmed token is remembered until it expires.
 *
 * Also requires role "authenticated", so the anon or service-role API keys
 * (which are JWTs too, without a user) are never treated as a photographer.
 */

const JWKS_TTL_MS = 10 * 60 * 1000
const CONFIRMED_CACHE_MAX = 500

let jwksCache = { url: null, keys: null, fetchedAt: 0 }
const confirmedTokens = new Map() // token -> { userId, exp }

export async function verifyJWT(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing Authorization header' }
  }
  const token = authHeader.slice(7).trim()

  let header, payload, signingInput, signature
  try {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Malformed token')
    header = JSON.parse(b64urlToString(parts[0]))
    payload = JSON.parse(b64urlToString(parts[1]))
    signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    signature = b64urlToBytes(parts[2])
  } catch {
    return { valid: false, error: 'Invalid token' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp < now) {
    return { valid: false, error: 'Token expired' }
  }
  if (!payload.sub) {
    return { valid: false, error: 'Invalid token: no subject' }
  }
  if (payload.role && payload.role !== 'authenticated') {
    return { valid: false, error: 'Invalid token: not a signed-in user' }
  }

  let ok = false
  try {
    if (header.alg === 'ES256' || header.alg === 'RS256') {
      ok = await verifyWithJwks(header, signingInput, signature, env)
    } else if (header.alg === 'HS256') {
      ok = env?.SUPABASE_JWT_SECRET
        ? await verifyHs256(signingInput, signature, env.SUPABASE_JWT_SECRET)
        : await confirmWithSupabase(token, payload, env)
    }
  } catch (err) {
    console.error('JWT verification error:', err)
    return { valid: false, error: 'Could not verify token' }
  }

  if (!ok) {
    return { valid: false, error: 'Invalid token signature' }
  }
  return { valid: true, userId: payload.sub, token }
}

// ── ES256 / RS256 against the project's public keys ──────────────────────
async function verifyWithJwks(header, signingInput, signature, env) {
  let keys = await getJwks(env, false)
  let jwk = keys.find(k => k.kid === header.kid)
  if (!jwk) {
    // Keys may have been rotated since we cached them: refetch once.
    keys = await getJwks(env, true)
    jwk = keys.find(k => k.kid === header.kid)
  }
  if (!jwk || jwk.alg && jwk.alg !== header.alg) return false

  if (header.alg === 'ES256') {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signingInput)
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput)
}

async function getJwks(env, force) {
  const url = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  const fresh = jwksCache.url === url && jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
  if (fresh && !force) return jwksCache.keys
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`)
  const body = await resp.json()
  jwksCache = { url, keys: Array.isArray(body.keys) ? body.keys : [], fetchedAt: Date.now() }
  return jwksCache.keys
}

// ── HS256 with the legacy shared secret ──────────────────────────────────
async function verifyHs256(signingInput, signature, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, signature, signingInput)
}

// ── HS256 without the secret: ask Supabase Auth ──────────────────────────
async function confirmWithSupabase(token, payload, env) {
  const cached = confirmedTokens.get(token)
  if (cached && cached.exp > Math.floor(Date.now() / 1000)) return cached.userId === payload.sub

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) return false
  const user = await resp.json()
  if (user?.id !== payload.sub) return false

  if (confirmedTokens.size >= CONFIRMED_CACHE_MAX) {
    confirmedTokens.delete(confirmedTokens.keys().next().value)
  }
  confirmedTokens.set(token, { userId: user.id, exp: payload.exp })
  return true
}

// ── base64url helpers ────────────────────────────────────────────────────
function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s))
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// For tests only.
export function _resetAuthCaches() {
  jwksCache = { url: null, keys: null, fetchedAt: 0 }
  confirmedTokens.clear()
}
