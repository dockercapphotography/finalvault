/**
 * Verify a share token against Supabase.
 * Uses plain text password and PIN comparison.
 */
export async function verifyShareToken(request, env, requirePin = false) {
  const shareToken = request.headers.get('X-Share-Token')
  if (!shareToken) {
    return { valid: false, error: 'Missing share token' }
  }

  try {
    const url = `${env.SUPABASE_URL}/rest/v1/galleries?share_token=eq.${encodeURIComponent(shareToken)}&is_active=eq.true&select=id,photographer_id,require_password,require_download_pin,plain_download_pin,download_watermarked,allow_downloads,allow_hires_download,expires_at`

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

    if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
      return { valid: false, error: 'Gallery has expired' }
    }

    if (requirePin && gallery.require_download_pin) {
      const pin = request.headers.get('X-Download-Pin')
      if (!pin) {
        return { valid: false, error: 'Download PIN required', needsPin: true }
      }
      if (pin !== gallery.plain_download_pin) {
        return { valid: false, error: 'Incorrect download PIN', needsPin: true }
      }
    }

    return {
      valid: true,
      galleryId: gallery.id,
      photographerId: gallery.photographer_id,
      downloadWatermarked: gallery.download_watermarked,
      allowDownloads: gallery.allow_downloads,
      allowHiresDownload: gallery.allow_hires_download,
    }
  } catch (err) {
    console.error('Share token verification error:', err)
    return { valid: false, error: 'Share token verification failed' }
  }
}
