import { supabase } from '../supabaseClient.js'

// ── Signup Pages ─────────────────────────────────────────────────────────────

export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, created_at,
      signup_shoot_types ( id ),
      signup_slots ( id, claimed_at, start_time )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(p => {
    const days = new Set((p.signup_slots ?? []).map(s => new Date(s.start_time).toLocaleDateString('en-CA', { timeZone: p.timezone })))
    return {
      ...p,
      shoot_type_count: p.signup_shoot_types?.length ?? 0,
      slot_total: p.signup_slots?.length ?? 0,
      slot_claimed: p.signup_slots?.filter(s => s.claimed_at).length ?? 0,
      day_count: days.size,
    }
  })
}

export async function getSignupPage(id) {
  const { data, error } = await supabase
    .from('signup_pages')
    .select('*, signup_shoot_types(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  data.signup_shoot_types = (data.signup_shoot_types ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return data
}

export async function createSignupPage({ title, venueAddress, venueLat, venueLng, timezone }) {
  const { data: { user } } = await supabase.auth.getUser()
  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('signup_pages')
    .insert({
      photographer_id: user.id,
      title: title.trim(),
      token,
      venue_address: venueAddress?.trim() || null,
      venue_lat: venueLat ?? null,
      venue_lng: venueLng ?? null,
      timezone: timezone || 'America/New_York',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSignupPage(id, updates) {
  const mapped = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) mapped.title = updates.title.trim()
  if (updates.venueAddress !== undefined) mapped.venue_address = updates.venueAddress?.trim() || null
  if (updates.venueLat !== undefined) mapped.venue_lat = updates.venueLat
  if (updates.venueLng !== undefined) mapped.venue_lng = updates.venueLng
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null
  if (updates.bookingDescription !== undefined) mapped.booking_description = updates.bookingDescription?.trim() || null

  const { data, error } = await supabase
    .from('signup_pages')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSignupPage(id) {
  const { error } = await supabase.from('signup_pages').delete().eq('id', id)
  if (error) throw error
}

// ── Shoot Types ──────────────────────────────────────────────────────────────

export async function createShootType({ signupPageId, name, durationMinutes, sessionType, description, sortOrder }) {
  const { data, error } = await supabase
    .from('signup_shoot_types')
    .insert({
      signup_page_id: signupPageId,
      name: name.trim(),
      duration_minutes: durationMinutes,
      session_type: sessionType || 'Portrait',
      description: description?.trim() || null,
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateShootType(id, updates) {
  const mapped = {}
  if (updates.name !== undefined) mapped.name = updates.name.trim()
  if (updates.durationMinutes !== undefined) mapped.duration_minutes = updates.durationMinutes
  if (updates.sessionType !== undefined) mapped.session_type = updates.sessionType
  if (updates.description !== undefined) mapped.description = updates.description?.trim() || null
  if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder

  const { data, error } = await supabase
    .from('signup_shoot_types')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteShootType(id) {
  const { error } = await supabase.from('signup_shoot_types').delete().eq('id', id)
  if (error) throw error
}

export async function getShootTypeQuestionnaires(shootTypeId) {
  const { data, error } = await supabase
    .from('signup_shoot_type_questionnaires')
    .select('questionnaire_id')
    .eq('shoot_type_id', shootTypeId)
  if (error) throw error
  return (data ?? []).map(r => r.questionnaire_id)
}

// Replace-all semantics -- simplest correct approach for a small list like
// this (a handful of questionnaires per shoot type at most), rather than
// diffing adds/removes.
export async function setShootTypeQuestionnaires(shootTypeId, questionnaireIds) {
  const { error: delError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .delete()
    .eq('shoot_type_id', shootTypeId)
  if (delError) throw delError

  if (questionnaireIds.length === 0) return

  const { error: insError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .insert(questionnaireIds.map((qId, i) => ({ shoot_type_id: shootTypeId, questionnaire_id: qId, sort_order: i })))
  if (insError) throw insError
}

// ── Slots ────────────────────────────────────────────────────────────────────

export async function getSlots(signupPageId) {
  const { data, error } = await supabase
    .from('signup_slots')
    .select('*')
    .eq('signup_page_id', signupPageId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Converts a wall-clock date/time as understood in a specific IANA
// timezone (e.g. "2026-08-01" "10:00" in "America/New_York") into the
// correct UTC instant. Deliberately NOT `new Date(dateStr + 'T' + timeStr)`
// -- that parses using the browser's own local timezone, which only
// happens to be correct if the person creating slots is physically in the
// same timezone as the venue. Library-free double-conversion technique:
// treat the wall-clock as a UTC reference point, see what that reference
// instant looks like when displayed in the target timezone, and use the
// difference to solve for the real offset.
function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(new Date(desired))
  const get = type => parts.find(p => p.type === type)?.value
  const hourVal = Number(get('hour'))
  const inTZAsUTC = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    hourVal === 24 ? 0 : hourVal, Number(get('minute')), Number(get('second')),
  )
  const offsetMs = desired - inTZAsUTC
  return new Date(desired + offsetMs)
}

// Bulk-inserts slots for a recurring pattern within a single day, e.g.
// 10:00am-6:00pm in 15-minute increments with a 5-minute buffer between
// each. Used by the slot generator -- one call per day block, since
// GenCon's days don't all run the same hours. `timezone` must be the
// signup page's own IANA timezone, not assumed from the browser.
export async function generateSlots({ signupPageId, shootTypeId, date, startTime, endTime, durationMinutes, bufferMinutes = 0, timezone }) {
  const slots = []
  const dayStart = zonedTimeToUtc(date, startTime, timezone)
  const dayEnd = zonedTimeToUtc(date, endTime, timezone)
  const stepMs = (durationMinutes + bufferMinutes) * 60_000
  const durationMs = durationMinutes * 60_000

  let cursor = dayStart
  while (cursor.getTime() + durationMs <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMs)
    slots.push({
      signup_page_id: signupPageId,
      shoot_type_id: shootTypeId,
      start_time: cursor.toISOString(),
      end_time: slotEnd.toISOString(),
    })
    cursor = new Date(cursor.getTime() + stepMs)
  }

  if (slots.length === 0) return []

  const { data, error } = await supabase
    .from('signup_slots')
    .insert(slots)
    .select()
  if (error) throw error
  return data
}

export async function deleteSlot(id) {
  const { error } = await supabase.from('signup_slots').delete().eq('id', id)
  if (error) throw error
}

// Single manually-specified slot, as opposed to the generator's batch
// insert -- for the "I just need one extra slot" case that doesn't
// justify running the generator for a single day. Takes the same
// date/time/timezone inputs as generateSlots (not raw ISO strings) so the
// same venue-local-to-UTC conversion applies consistently either way.
export async function createManualSlot({ signupPageId, shootTypeId, date, startTime, durationMinutes, timezone }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const { data, error } = await supabase
    .from('signup_slots')
    .insert({
      signup_page_id: signupPageId, shoot_type_id: shootTypeId,
      start_time: start.toISOString(), end_time: end.toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Deliberately scoped to OPEN slots only -- a "clear slots" action should
// never silently delete already-claimed slots, since those represent
// real client bookings with real sessions attached. If someone wants to
// remove a specific claimed slot's record, that's a one-at-a-time
// decision, not a bulk one.
export async function deleteAllOpenSlots(signupPageId) {
  const { error } = await supabase
    .from('signup_slots')
    .delete()
    .eq('signup_page_id', signupPageId)
    .is('claimed_at', null)
  if (error) throw error
}

// Frees a claimed slot back to open, for a no-show or a booking mistake.
// Deliberately does NOT touch the client or session records created when
// the slot was originally claimed -- those stay as real business records
// (the client's contact info, the session itself, which the photographer
// can still separately mark cancelled in Sessions if they want). This
// only resets the slot so it can be booked again.
export async function unclaimSlot(id) {
  const { error } = await supabase
    .from('signup_slots')
    .update({
      claimed_at: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      client_pronouns: null,
    })
    .eq('id', id)
  if (error) throw error
}

// A private, photographer-only note on a slot (e.g. "brought 2 friends,
// wants extra prints"). Never shown to the client, never touched by the
// public claim_signup_slot RPC or the public booking page.
export async function updateSlotNote(id, note) {
  const { error } = await supabase
    .from('signup_slots')
    .update({ photographer_note: note?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

// ── Public booking (anonymous, via RPC) ─────────────────────────────────────

export async function getSignupPageData(token) {
  const { data, error } = await supabase.rpc('get_signup_page_data', { p_token: token })
  if (error) throw error
  return data
}

export async function claimSignupSlot({ slotId, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabase.rpc('claim_signup_slot', {
    p_slot_id: slotId,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_email: email.trim(),
    p_phone: phone?.trim() || null,
    p_pronouns: pronouns || null,
  })
  if (error) throw error
  return data
}
