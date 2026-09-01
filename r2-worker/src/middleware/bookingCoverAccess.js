/**
 * Verifies that a requested preview image legitimately belongs to a
 * currently-active signup page as its cover photo -- the booking-page
 * counterpart to verifyMicrositeAccess() in micrositeAccess.js. Same
 * reasoning: no client-supplied secret at all, legitimacy comes entirely
 * from server-side state (Supabase), re-checked fresh on EVERY request
 * against the EXACT column it claims to be
 * (signup_pages.cover_image_r2_key), never a folder-convention match --
 * unlike /logo/ and /avatar/, which key off folder conventions. A signup
 * page's photographer may have private client galleries sitting right
 * next to whatever photo they picked as a cover, so a loose match here
 * would expose far more than intended.
 *
 * The image itself is already intentionally public: it's the exact photo
 * shown to every visitor of that page's live booking form.
 */
export async function verifyBookingCoverAccess(key, env) {
  const photographerMatch = key.match(/^photographers\/([^/]+)\//)
  if (!photographerMatch) {
    return { valid: false, error: 'Invalid key format for booking cover access' }
  }
  const photographerId = photographerMatch[1]

  try {
    const checkUrl = `${env.SUPABASE_URL}/rest/v1/signup_pages?select=id&photographer_id=eq.${photographerId}&cover_image_r2_key=eq.${encodeURIComponent(key)}&is_active=eq.true&limit=1`
    const checkRes = await fetch(checkUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })
    if (!checkRes.ok) {
      return { valid: false, error: 'Failed to validate booking cover access' }
    }

    const rows = await checkRes.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: 'Image is not an active booking page cover' }
    }

    return { valid: true, photographerId }
  } catch (err) {
    console.error('Booking cover access verification error:', err)
    return { valid: false, error: 'Booking cover access verification failed' }
  }
}
