// Verify share token and optional download PIN for client access
export async function verifyShareToken(request, env) {
  const shareToken = request.headers.get('X-Share-Token')
  const downloadPin = request.headers.get('X-Download-Pin')
  if (!shareToken) {
    return { valid: false, error: 'Missing share token' }
  }
  // TODO: Validate token + PIN against Supabase
  return { valid: false, error: 'Not implemented' }
}
