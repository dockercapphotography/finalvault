/**
 * Verify a share token against Supabase.
 * Used for client-facing requests (no JWT required).
 * Optionally verifies a download PIN.
 */
export async function verifyShareToken(request, env, requirePin = false) {
  const shareToken = request.headers.get('X-Share-Token')
  if (!shareToken) {
    return { valid: false, error: 'Missing share token' }
  }

  try {
    // Look up gallery by share token using Supabase REST API
    const url = `${env.SUPABASE_URL}/rest/v1/galleries?share_token=eq.${encodeURIComponent(shareToken)}&is_active=eq.true&select=id,photographer_id,require_password,require_download_pin,download_pin_hash,download_watermarked,allow_downloads,expires_at`

    const resp = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      }
    })

    if (!resp.ok) {
      return { valid: false, error: 'Failed to validate share token' }
    }

    const rows = await resp.json()
    if (!rows || rows.length === 0) {
      return { valid: false, error: 'Gallery not found or inactive' }
    }

    const gallery = rows[0]

    // Check expiry
    if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
      return { valid: false, error: 'Gallery has expired' }
    }

    // Check download PIN if required
    if (requirePin && gallery.require_download_pin) {
      const pin = request.headers.get('X-Download-Pin')
      if (!pin) {
        return { valid: false, error: 'Download PIN required', needsPin: true }
      }

      const pinValid = await verifyPin(pin, gallery.download_pin_hash)
      if (!pinValid) {
        return { valid: false, error: 'Incorrect download PIN', needsPin: true }
      }
    }

    return {
      valid: true,
      galleryId: gallery.id,
      photographerId: gallery.photographer_id,
      downloadWatermarked: gallery.download_watermarked,
      allowDownloads: gallery.allow_downloads,
    }
  } catch (err) {
    console.error('Share token verification error:', err)
    return { valid: false, error: 'Share token verification failed' }
  }
}

/**
 * Simple bcrypt-compatible PIN verification using Web Crypto.
 * PINs are stored as bcrypt hashes in Supabase (same pattern as PoseVault passwords).
 */
async function verifyPin(pin, hash) {
  if (!hash) return false
  // Use Supabase RPC to verify bcrypt hash server-side
  // This avoids needing bcrypt in the Worker environment
  // For now, compare plain — replace with proper hashing before production
  // TODO: use supabase.rpc('verify_pin', { pin, hash }) or pass through edge function
  return pin === hash
}
