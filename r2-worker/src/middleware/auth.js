// Verify Supabase JWT for photographer-authenticated requests
export async function verifyJWT(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' }
  }
  const token = authHeader.slice(7)
  // TODO: Verify JWT against Supabase JWT secret
  return { valid: false, error: 'Not implemented' }
}
