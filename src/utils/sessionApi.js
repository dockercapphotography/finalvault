import { supabase } from '../supabaseClient.js'

const SESSION_TYPES = [
  'Convention', 'Corporate', 'Event', 'Family', 'Graduation',
  'Maternity', 'Newborn', 'Portrait', 'Wedding', 'Other',
]

export { SESSION_TYPES }

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions({ status, type, mode } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  let query = supabase
    .from('sessions')
    .select(`
      id, name, type, mode, status, session_date, start_time, end_time,
      location, payment_status, created_at, updated_at,
      client_id, clients(first_name, last_name)
    `)
    .eq('photographer_id', user.id)
    .order('session_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (type) query = query.eq('type', type)
  if (mode) query = query.eq('mode', mode)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      clients(id, first_name, last_name, email, phone, pronouns, avatar_r2_key),
      galleries(id, title, event_name, event_date, share_token),
      questionnaire_templates(id, name)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createSession({
  name, type, mode, status, sessionDate, startTime, endTime,
  location, locationLat, locationLng, description, internalNotes,
  clientId, galleryId, questionnaireId,
  sessionFee, retainerAmount, retainerPaid, balanceDue, balanceDueDate, paymentStatus,
}) {
  const { data: { user } } = await supabase.auth.getUser()

  const submitToken = crypto.randomUUID().replace(/-/g, '')

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      photographer_id: user.id,
      name: name.trim(),
      type: type || 'Portrait',
      mode: mode || 'private',
      status: status || 'inquiry',
      session_date: sessionDate || null,
      start_time: startTime ? (startTime.length === 5 ? startTime + ':00' : startTime) : null,
      end_time: endTime ? (endTime.length === 5 ? endTime + ':00' : endTime) : null,
      location: location?.trim() || null,
      location_lat: locationLat || null,
      location_lng: locationLng || null,
      description: description?.trim() || null,
      internal_notes: internalNotes?.trim() || null,
      client_id: clientId || null,
      gallery_id: galleryId || null,
      questionnaire_id: questionnaireId || null,
      session_fee: sessionFee || null,
      retainer_amount: retainerAmount || null,
      retainer_paid: retainerPaid || false,
      balance_due: balanceDue || null,
      balance_due_date: balanceDueDate || null,
      payment_status: paymentStatus || 'unpaid',
      submit_token: submitToken,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSession(id, updates) {
  const mapped = {}
  if (updates.name !== undefined) mapped.name = updates.name.trim()
  if (updates.type !== undefined) mapped.type = updates.type
  if (updates.mode !== undefined) mapped.mode = updates.mode
  if (updates.status !== undefined) mapped.status = updates.status
  if (updates.sessionDate !== undefined) mapped.session_date = updates.sessionDate || null
  if (updates.startTime !== undefined) mapped.start_time = updates.startTime ? (updates.startTime.length === 5 ? updates.startTime + ':00' : updates.startTime) : null
  if (updates.endTime !== undefined) mapped.end_time = updates.endTime ? (updates.endTime.length === 5 ? updates.endTime + ':00' : updates.endTime) : null
  if (updates.location !== undefined) mapped.location = updates.location?.trim() || null
  if (updates.locationLat !== undefined) mapped.location_lat = updates.locationLat || null
  if (updates.locationLng !== undefined) mapped.location_lng = updates.locationLng || null
  if (updates.description !== undefined) mapped.description = updates.description?.trim() || null
  if (updates.internalNotes !== undefined) mapped.internal_notes = updates.internalNotes?.trim() || null
  if (updates.clientId !== undefined) mapped.client_id = updates.clientId || null
  if (updates.galleryId !== undefined) mapped.gallery_id = updates.galleryId || null
  if (updates.questionnaireId !== undefined) mapped.questionnaire_id = updates.questionnaireId || null
  if (updates.sessionFee !== undefined) mapped.session_fee = updates.sessionFee || null
  if (updates.retainerAmount !== undefined) mapped.retainer_amount = updates.retainerAmount || null
  if (updates.retainerPaid !== undefined) mapped.retainer_paid = updates.retainerPaid
  if (updates.balanceDue !== undefined) mapped.balance_due = updates.balanceDue || null
  if (updates.balanceDueDate !== undefined) mapped.balance_due_date = updates.balanceDueDate || null
  if (updates.paymentStatus !== undefined) mapped.payment_status = updates.paymentStatus

  mapped.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('sessions')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteSession(id) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Submissions ───────────────────────────────────────────────────────────────

export async function getSubmissions(sessionId) {
  const { data, error } = await supabase
    .from('session_submissions')
    .select('*')
    .eq('session_id', sessionId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const SESSION_STATUSES = [
  { value: 'inquiry',   label: 'Inquiry',   color: '#6b7280' },
  { value: 'booked',    label: 'Booked',    color: '#6366f1' },
  { value: 'completed', label: 'Completed', color: '#10b981' },
  { value: 'delivered', label: 'Delivered', color: '#0ea5e9' },
  { value: 'archived',  label: 'Archived',  color: '#94a3b8' },
]

export const PAYMENT_STATUSES = [
  { value: 'unpaid',  label: 'Unpaid',  color: '#ef4444' },
  { value: 'partial', label: 'Partial', color: '#f97316' },
  { value: 'paid',    label: 'Paid',    color: '#10b981' },
]

export function getStatusConfig(value) {
  return SESSION_STATUSES.find(s => s.value === value) || SESSION_STATUSES[0]
}

export function getPaymentConfig(value) {
  return PAYMENT_STATUSES.find(s => s.value === value) || PAYMENT_STATUSES[0]
}

export function formatSessionDate(date, startTime, endTime) {
  if (!date) return null
  const d = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (!startTime) return d
  const fmt = t => {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    return `${hour % 12 || 12}:${m} ${ampm}`
  }
  return `${d} · ${fmt(startTime)}${endTime ? ` – ${fmt(endTime)}` : ''}`
}

// ── Session Questionnaires (junction table) ───────────────────────────────────

export async function getSessionQuestionnaires(sessionId) {
  const { supabase } = await import('../supabaseClient.js')
  const { data, error } = await supabase
    .from('session_questionnaires')
    .select('id, questionnaire_id, sort_order, questionnaire_templates(id, name)')
    .eq('session_id', sessionId)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function addSessionQuestionnaire(sessionId, questionnaireId, sortOrder = 0) {
  const { supabase } = await import('../supabaseClient.js')
  const { data, error } = await supabase
    .from('session_questionnaires')
    .insert({ session_id: sessionId, questionnaire_id: questionnaireId, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeSessionQuestionnaire(sessionId, questionnaireId) {
  const { supabase } = await import('../supabaseClient.js')
  const { error } = await supabase
    .from('session_questionnaires')
    .delete()
    .eq('session_id', sessionId)
    .eq('questionnaire_id', questionnaireId)
  if (error) throw error
}

export async function setSessionQuestionnaires(sessionId, questionnaireIds) {
  // Replace all questionnaires for a session with the given list
  const { supabase } = await import('../supabaseClient.js')
  await supabase.from('session_questionnaires').delete().eq('session_id', sessionId)
  if (!questionnaireIds.length) return
  const { error } = await supabase
    .from('session_questionnaires')
    .insert(questionnaireIds.map((qid, i) => ({
      session_id: sessionId,
      questionnaire_id: qid,
      sort_order: i,
    })))
  if (error) throw error
}
