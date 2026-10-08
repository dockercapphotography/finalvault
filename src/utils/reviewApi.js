import { supabase } from '../supabaseClient.js'
import { resolveTemplateVariables } from './crmApi.js'

// Client reviews (v1.5.17) -- request templates, a session's review
// status, and sending a request. Schema and RPCs: sql/086-089.
//
// Template CRUD follows emailTemplateApi.js exactly (same trim rules,
// same "(Copy)" duplicate convention, reassigned to the current user).
// The one addition is is_default, which is only ever changed through
// set_default_review_request_template -- a partial unique index allows
// one default per photographer, and the RPC clears the old one first.

// Every one of these is already handled by crmApi.js's
// resolveTemplateVariables (shared with contracts), so the request modal
// resolves them with that same function rather than a second copy.
export const REVIEW_REQUEST_VARIABLES = [
  { tag: '{{client_first_name}}', desc: 'Client first name' },
  { tag: '{{client_name}}',       desc: 'Full client name' },
  { tag: '{{session_name}}',      desc: 'Session name' },
  { tag: '{{session_type}}',      desc: 'Session type' },
  { tag: '{{session_date}}',      desc: 'Session date' },
  { tag: '{{studio_name}}',       desc: 'Your business name' },
  { tag: '{{photographer_name}}', desc: 'Your display name' },
]

// Used by the request modal when no templates exist yet.
export const BUILT_IN_REVIEW_REQUEST = {
  name: 'Default message',
  subject: 'How was your session, {{client_first_name}}?',
  body: "Hi {{client_first_name}},\n\nThanks again for your session! If you have a minute, I'd love to hear how it went. A few sentences is plenty.\n\n— {{studio_name}}",
}

export function resolveReviewTemplate(text, { photographer, client, session }) {
  return resolveTemplateVariables(text || '', { photographer, client, session })
}

// "Jordan M." -- privacy-friendly default for a public website. The
// client can change it on the review page.
export function defaultReviewName(client) {
  if (!client) return ''
  const first = (client.first_name || '').trim()
  const lastInitial = (client.last_name || '').trim().charAt(0)
  return [first, lastInitial ? `${lastInitial}.` : ''].filter(Boolean).join(' ')
}

export function reviewLink(baseUrl, token) {
  return `${baseUrl}/review/${token}`
}

// ── Templates ────────────────────────────────────────────────────────

export async function getReviewRequestTemplates() {
  const { data, error } = await supabase
    .from('review_request_templates')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createReviewRequestTemplate({ name, subject, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('review_request_templates')
    .insert({
      photographer_id: user.id,
      name: name.trim(),
      subject: subject.trim(),
      body: (body || '').trim(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateReviewRequestTemplate(id, { name, subject, body }) {
  const updates = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (subject !== undefined) updates.subject = subject.trim()
  if (body !== undefined) updates.body = body.trim()

  const { data, error } = await supabase
    .from('review_request_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteReviewRequestTemplate(id) {
  const { error } = await supabase.from('review_request_templates').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateReviewRequestTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('review_request_templates')
    .insert({
      photographer_id: user.id,
      name: `${template.name} (Copy)`,
      subject: template.subject,
      body: template.body,
      is_default: false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// templateId null clears the default.
export async function setDefaultReviewRequestTemplate(templateId) {
  const { error } = await supabase.rpc('set_default_review_request_template', { p_template_id: templateId })
  if (error) throw error
}

// ── A session's review ───────────────────────────────────────────────

// Returns null when no review has been requested, otherwise
// { request, submission, onWebsite }:
//   submission -- null until the client sends it
//   onWebsite  -- for an approved review, whether its published copy is
//                 still in microsites.testimonials (the photographer can
//                 remove it from the Website editor like any testimonial)
export async function getSessionReview(sessionId) {
  const { data: request, error } = await supabase
    .from('testimonial_requests')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!request) return null

  const { data: submission } = await supabase
    .from('testimonial_submissions')
    .select('*')
    .eq('request_id', request.id)
    .maybeSingle()

  let onWebsite = false
  if (submission?.status === 'approved' && submission.published_testimonial_id) {
    const { data: site } = await supabase.from('microsites').select('testimonials').maybeSingle()
    const list = Array.isArray(site?.testimonials) ? site.testimonials : []
    onWebsite = list.some(t => t?.id === submission.published_testimonial_id)
  }

  return { request, submission: submission || null, onWebsite }
}

// ── Approval queue (Website editor) ─────────────────────────────────

export async function getPendingReviews() {
  const { data, error } = await supabase
    .from('testimonial_submissions')
    .select('*, testimonial_requests(session_id, sessions(id, name))')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Returns the published testimonial entry, already added to the top of
// microsites.testimonials by the RPC.
export async function approveReview(submissionId, { quote, name, session_type, photo_gallery_image_key, photo_focus_x, photo_focus_y }) {
  const { data, error } = await supabase.rpc('approve_testimonial_submission', {
    p_submission_id: submissionId,
    p_quote: quote,
    p_name: name,
    p_session_type: session_type || null,
    p_photo_key: photo_gallery_image_key || null,
    p_photo_focus_x: photo_focus_x ?? null,
    p_photo_focus_y: photo_focus_y ?? null,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function rejectReview(submissionId) {
  const { error } = await supabase.rpc('reject_testimonial_submission', { p_submission_id: submissionId })
  if (error) throw new Error(error.message)
}

// sendEmail false just creates (or returns) the session's link -- that's
// how "Copy link instead" works. Errors from the RPC are written for the
// photographer and safe to show as-is.
export async function sendReviewRequest({ sessionId, displayName, subject, body, sendEmail }) {
  const { data, error } = await supabase.rpc('send_testimonial_request', {
    p_session_id: sessionId,
    p_display_name: displayName || null,
    p_subject: subject || null,
    p_body: body || null,
    p_send_email: !!sendEmail,
  })
  if (error) throw new Error(error.message)
  return data
}
