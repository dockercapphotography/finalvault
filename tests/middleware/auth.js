/**
 * Verify a Supabase JWT and extract the user ID.
 * Used for photographer-authenticated requests.
 */
export async function verifyJWT(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing Authorization header' }
  }

  const token = authHeader.slice(7)

  try {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Malformed token')

    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payloadJson = atob(payloadB64)
    const payload = JSON.parse(payloadJson)

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' }
    }

    if (!payload.sub) {
      return { valid: false, error: 'Invalid token: no subject' }
    }

    return { valid: true, userId: payload.sub, token }
  } catch (err) {
    return { valid: false, error: 'Invalid token' }
  }
}
