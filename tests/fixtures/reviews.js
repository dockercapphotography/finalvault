import { createClient } from '@supabase/supabase-js'

// Shared setup for the v1.5.17 review specs (review-page, review-image-access,
// review-requests, review-approval, review-request-templates,
// review-notifications).
//
// Quota rule: nothing here sends a client-facing email -- requests are
// inserted directly (the Copy link path), never through Send. Approval
// specs insert submissions directly too, which skips the photographer's
// "New review" email entirely. The few tests that need the real
// submit_testimonial flow call setReviewEmail(false) first, so the
// photographer email is skipped there as well (sql/094).

export function adminClient() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getTestPhotographerId(sb) {
  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

const uid = () => crypto.randomUUID().slice(0, 8)

// A session (private by default) with an optional client and linked
// galleries (session_galleries, in the given order). Returns
// { session, client, cleanup }. cleanup() removes everything it made,
// including any review requests (submissions cascade) and the bell
// notifications a real submission created.
export async function createReviewSession(sb, photographerId, {
  mode = 'private', withClient = true, galleryIds = [], type = 'Portrait',
} = {}) {
  const tag = uid()
  let client = null
  if (withClient) {
    const { data, error } = await sb.from('clients').insert({
      photographer_id: photographerId,
      first_name: 'Revi',
      last_name: `Tester-${tag}`,
      email: `review-${tag}@example.com`,
      tags: [],
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(`createReviewSession client: ${error.message}`)
    client = data
  }

  const { data: session, error } = await sb.from('sessions').insert({
    photographer_id: photographerId,
    client_id: client?.id ?? null,
    name: `PW Review Session ${tag}`,
    type,
    mode,
    status: 'inquiry',
    submit_token: crypto.randomUUID().replace(/-/g, ''),
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(`createReviewSession session: ${error.message}`)

  if (galleryIds.length) {
    const { error: linkErr } = await sb.from('session_galleries').insert(
      galleryIds.map((gallery_id, i) => ({ session_id: session.id, gallery_id, sort_order: i }))
    )
    if (linkErr) throw new Error(`createReviewSession galleries: ${linkErr.message}`)
  }

  async function cleanup() {
    await sb.from('notifications').delete().like('url', `/sessions/${session.id}%`)
    await sb.from('testimonial_requests').delete().eq('session_id', session.id)
    await sb.from('session_galleries').delete().eq('session_id', session.id)
    await sb.from('sessions').delete().eq('id', session.id)
    if (client) await sb.from('clients').delete().eq('id', client.id)
  }

  return { session, client, cleanup }
}

// Removes sessions/clients a previous run left behind (a test that times
// out never reaches its finally-block cleanup). Deleting the session
// cascades to its requests and submissions. Call from each review spec's
// beforeAll so a stale pending review can't leak into the approval panel.
export async function cleanupLeftovers(sb, photographerId) {
  const { data: stale } = await sb.from('sessions').select('id')
    .eq('photographer_id', photographerId).like('name', 'PW Review Session%')
  for (const { id } of stale || []) {
    await sb.from('notifications').delete().like('url', `/sessions/${id}%`)
    await sb.from('session_galleries').delete().eq('session_id', id)
    await sb.from('sessions').delete().eq('id', id)
  }
  await sb.from('clients').delete()
    .eq('photographer_id', photographerId).like('email', 'review-%@example.com')
}

// Inserts a request directly -- the same row Copy link creates, no email.
export async function createRequest(sb, photographerId, { session, client, displayName = null, suggestedPhotoKey = null }) {
  const { data, error } = await sb.from('testimonial_requests').insert({
    photographer_id: photographerId,
    session_id: session.id,
    client_id: client?.id ?? null,
    display_name: displayName,
    suggested_photo_key: suggestedPhotoKey,
  }).select().single()
  if (error) throw new Error(`createRequest: ${error.message}`)
  return data
}

// Inserts a submission directly (no bell, push, or email). Use for any
// test that only needs a review to exist.
export async function insertSubmission(sb, photographerId, request, {
  quote = `PW review ${uid()}`, name = 'Revi T.', sessionType = 'Portrait',
  photoKey = null, galleryImageId = null, status = 'pending', publishedTestimonialId = null,
} = {}) {
  const { data, error } = await sb.from('testimonial_submissions').insert({
    request_id: request.id,
    photographer_id: photographerId,
    quote,
    name,
    session_type: sessionType,
    photo_r2_key: photoKey,
    gallery_image_id: galleryImageId,
    consented_at: new Date().toISOString(),
    status,
    published_testimonial_id: publishedTestimonialId,
    reviewed_at: status === 'pending' ? null : new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(`insertSubmission: ${error.message}`)
  return data
}

// The real client submit (bell + push + photographer email). Call
// setReviewEmail(sb, id, false) first so it doesn't spend Resend quota.
export async function submitViaRpc(sb, token, { quote, name = 'Revi T.', galleryImageId = null } = {}) {
  const { data, error } = await sb.rpc('submit_testimonial', {
    p_token: token,
    p_quote: quote,
    p_name: name,
    p_gallery_image_id: galleryImageId,
    p_consent: true,
  })
  if (error) throw new Error(`submit_testimonial: ${error.message}`)
  return data
}

// Reads the current "New review" email preference (null = no row = on).
export async function getReviewEmail(sb, photographerId) {
  const { data } = await sb.from('email_notification_preferences')
    .select('testimonial').eq('photographer_id', photographerId).maybeSingle()
  return data ? data.testimonial : null
}

// enabled null deletes the row (back to "no row = on").
export async function setReviewEmail(sb, photographerId, enabled) {
  if (enabled === null) {
    await sb.from('email_notification_preferences').delete().eq('photographer_id', photographerId)
    return
  }
  const { error } = await sb.from('email_notification_preferences').upsert(
    { photographer_id: photographerId, testimonial: enabled, updated_at: new Date().toISOString() },
    { onConflict: 'photographer_id' }
  )
  if (error) throw new Error(`setReviewEmail: ${error.message}`)
}

// approve_testimonial_submission needs a microsites row. The editor
// auto-creates one on first visit, but Session Detail doesn't, so specs
// that approve there call this. Pair with the testMicrosite fixture,
// which deletes the row afterwards if it didn't exist before.
export async function ensureMicrosite(sb, photographerId) {
  const { data } = await sb.from('microsites').select('id').eq('photographer_id', photographerId).maybeSingle()
  if (data) return
  const { error } = await sb.from('microsites').insert({ photographer_id: photographerId, enabled: false })
  if (error) throw new Error(`ensureMicrosite: ${error.message}`)
}

export async function getMicrositeTestimonials(sb, photographerId) {
  const { data } = await sb.from('microsites').select('testimonials').eq('photographer_id', photographerId).maybeSingle()
  return Array.isArray(data?.testimonials) ? data.testimonials : []
}
