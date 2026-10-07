/**
 * Verifies that a requested preview image may be shown on the public
 * /review/:token page -- the session gallery's cover, or a live preview
 * from that same gallery, for the photo picker.
 *
 * Unlike verifyMicrositeAccess / verifyBookingCoverAccess /
 * verifyQuestionnaireCoverAccess, this mode IS gated by a client-supplied
 * secret: the review token (?review_token=), which only the client the
 * photographer sent it to has. It grants nothing beyond preview images of
 * that one session's gallery -- never originals, downloads, zips, or the
 * gallery's own share-token access -- and the check is re-run against
 * Supabase on every request, so revoking the request, archiving the
 * gallery, deleting an image, or losing premium access takes effect
 * immediately.
 *
 * The whole check lives in one SQL function, review_image_access()
 * (sql/087_review_image_access.sql), called with the service key: one
 * round-trip per image rather than chained REST lookups through
 * testimonial_requests -> sessions -> galleries -> gallery_images.
 */
export async function verifyReviewImageAccess(key, reviewToken, env) {
  if (!/^photographers\/[^/]+\//.test(key)) {
    return { valid: false, error: 'Invalid key format for review image access' }
  }
  // Tokens are 32 hex chars (replace(gen_random_uuid()::text, '-', '')).
  // Rejecting anything else up front skips a Supabase round-trip for junk.
  if (!/^[a-f0-9]{32}$/.test(reviewToken || '')) {
    return { valid: false, error: 'Invalid review token' }
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/review_image_access`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: reviewToken, p_key: key }),
    })
    if (!res.ok) {
      return { valid: false, error: 'Failed to validate review image access' }
    }

    const photographerId = await res.json().catch(() => null)
    if (!photographerId || typeof photographerId !== 'string') {
      return { valid: false, error: 'Image is not available for this review' }
    }

    return { valid: true, photographerId }
  } catch (err) {
    console.error('Review image access verification error:', err)
    return { valid: false, error: 'Review image access verification failed' }
  }
}
