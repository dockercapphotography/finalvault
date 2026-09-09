/**
 * Verifies that a requested preview image legitimately belongs to a
 * questionnaire template's cover photo -- the questionnaire-template
 * counterpart to verifyBookingCoverAccess() in bookingCoverAccess.js and
 * verifyMicrositeAccess() in micrositeAccess.js. Same reasoning: no
 * client-supplied secret at all, legitimacy comes entirely from
 * server-side state (Supabase), re-checked fresh on EVERY request
 * against the EXACT column it claims to be
 * (questionnaire_templates.cover_image_r2_key), never a folder-convention
 * match.
 *
 * Unlike signup_pages, questionnaire_templates has no is_active concept
 * to also check -- a template is either owned by this photographer with
 * this key set as its cover, or it isn't.
 *
 * The image itself is already intentionally public: it's the exact photo
 * shown to every visitor of that questionnaire's live /submit/:token page.
 */
export async function verifyQuestionnaireCoverAccess(key, env) {
  const photographerMatch = key.match(/^photographers\/([^/]+)\//)
  if (!photographerMatch) {
    return { valid: false, error: 'Invalid key format for questionnaire cover access' }
  }
  const photographerId = photographerMatch[1]

  try {
    const checkUrl = `${env.SUPABASE_URL}/rest/v1/questionnaire_templates?select=id&photographer_id=eq.${photographerId}&cover_image_r2_key=eq.${encodeURIComponent(key)}&limit=1`
    const checkRes = await fetch(checkUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })
    if (!checkRes.ok) {
      return { valid: false, error: 'Failed to validate questionnaire cover access' }
    }

    const rows = await checkRes.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: 'Image is not a questionnaire template cover' }
    }

    return { valid: true, photographerId }
  } catch (err) {
    console.error('Questionnaire cover access verification error:', err)
    return { valid: false, error: 'Questionnaire cover access verification failed' }
  }
}
