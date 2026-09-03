import { supabase } from '../supabaseClient.js'

// ── Signup Pages ─────────────────────────────────────────────────────────────

export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, archived_at, mode, created_at,
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

export async function getMyAllSessionsToken() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('photographers')
    .select('all_sessions_token')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data.all_sessions_token
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

export async function createSignupPage({ title, venueAddress, venueLat, venueLng, timezone, mode }) {
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
      mode: mode || 'slots',
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
  if (updates.archivedAt !== undefined) mapped.archived_at = updates.archivedAt
  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null
  if (updates.bookingDescription !== undefined) mapped.booking_description = updates.bookingDescription?.trim() || null
  if (updates.showPricing !== undefined) mapped.show_pricing = updates.showPricing
  if (updates.coverPattern !== undefined) mapped.cover_pattern = updates.coverPattern
  if (updates.coverImageR2Key !== undefined) mapped.cover_image_r2_key = updates.coverImageR2Key
  if (updates.coverFocusX !== undefined) mapped.cover_focus_x = updates.coverFocusX
  if (updates.coverFocusY !== undefined) mapped.cover_focus_y = updates.coverFocusY
  if (updates.bufferMinutes !== undefined) mapped.buffer_minutes = updates.bufferMinutes
  if (updates.maxDailyInquiries !== undefined) mapped.max_daily_inquiries = updates.maxDailyInquiries

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

// Returns { claimed_slot_count } for the delete-confirm dialog -- see
// sql/063_signup_page_archive_and_delete_impact.sql. Owner-checked
// server-side via auth.uid(), same pattern as getSessionDeletionImpact.
export async function getSignupPageDeleteImpact(id) {
  const { data, error } = await supabase.rpc('get_signup_page_delete_impact', { p_id: id })
  if (error) throw error
  return data
}

// ── Inquiry Windows (mode = 'inquiry' pages only) ───────────────────────────
// See sql/064_inquiry_signup_pages.sql. Multiple windows can exist per page
// -- e.g. different day/time patterns for April vs May -- each is its own row.

export async function getInquiryWindows(signupPageId) {
  const { data, error } = await supabase
    .from('signup_inquiry_windows')
    .select('*')
    .eq('signup_page_id', signupPageId)
    .order('sort_order', { ascending: true })
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createInquiryWindow({ signupPageId, daysOfWeek, startDate, endDate, startTime, endTime, sortOrder }) {
  const { data, error } = await supabase
    .from('signup_inquiry_windows')
    .insert({
      signup_page_id: signupPageId,
      days_of_week: daysOfWeek,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInquiryWindow(id, updates) {
  const mapped = {}
  if (updates.daysOfWeek !== undefined) mapped.days_of_week = updates.daysOfWeek
  if (updates.startDate !== undefined) mapped.start_date = updates.startDate
  if (updates.endDate !== undefined) mapped.end_date = updates.endDate
  if (updates.startTime !== undefined) mapped.start_time = updates.startTime
  if (updates.endTime !== undefined) mapped.end_time = updates.endTime
  const { data, error } = await supabase
    .from('signup_inquiry_windows')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInquiryWindow(id) {
  const { error } = await supabase.from('signup_inquiry_windows').delete().eq('id', id)
  if (error) throw error
}

// Public submit path (anonymous, via RPC) -- validated server-side
// against the page's own windows (see submit_signup_inquiry in
// sql/064). Not wired into any UI yet.
export async function submitSignupInquiry({ signupPageId, shootTypeId, date, time, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabase.rpc('submit_signup_inquiry', {
    p_signup_page_id: signupPageId,
    p_shoot_type_id: shootTypeId,
    p_date: date,
    p_time: time,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_email: email.trim(),
    p_phone: phone?.trim() || null,
    p_pronouns: pronouns || null,
  })
  if (error) throw error
  return data
}

// ── Shoot Types ──────────────────────────────────────────────────────────────

export async function createShootType({ signupPageId, name, durationMinutes, sessionType, description, sortOrder, price, retainerAmount }) {
  const { data, error } = await supabase
    .from('signup_shoot_types')
    .insert({
      signup_page_id: signupPageId,
      name: name.trim(),
      duration_minutes: durationMinutes,
      session_type: sessionType || 'Portrait',
      description: description?.trim() || null,
      sort_order: sortOrder ?? 0,
      price: price === '' || price == null ? null : price,
      retainer_amount: retainerAmount === '' || retainerAmount == null ? null : retainerAmount,
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
  if (updates.price !== undefined) mapped.price = updates.price === '' || updates.price == null ? null : updates.price
  if (updates.retainerAmount !== undefined) mapped.retainer_amount = updates.retainerAmount === '' || updates.retainerAmount == null ? null : updates.retainerAmount

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
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
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

// Checks what's actually attached to a session before it gets deleted as
// part of a no-show -- galleries, submitted questionnaires, sent
// questionnaires, and contracts. Contracts are SET NULL (not
// cascade-deleted) at the DB level when a session is removed, so they're
// reported separately as "orphaned" rather than "deleted" -- everything
// else here genuinely gets deleted by the cascade.
export async function getSessionDeletionImpact(sessionId) {
  const [{ count: galleries }, { count: submissions }, { count: questionnaireSends }, { count: contracts }] = await Promise.all([
    supabase.from('session_galleries').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('session_submissions').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('questionnaire_sends').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return { galleries: galleries ?? 0, submissions: submissions ?? 0, questionnaireSends: questionnaireSends ?? 0, contracts: contracts ?? 0 }
}

// Deletes the session record itself. session_questionnaires/
// session_galleries/session_submissions/questionnaire_sends cascade-delete
// via the DB's own foreign keys; contracts get SET NULL (orphaned, not
// deleted). Call getSessionDeletionImpact first and get the photographer's
// confirmation if it reports anything -- this function itself doesn't ask.
export async function deleteSession(sessionId) {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  if (error) throw error
}

// Frees a claimed slot back to open, for a no-show or a booking mistake.
// Resets the slot's own fields only -- deleting the session it points to
// (if any) is the caller's job via deleteSession above, since that's a
// separate, bigger decision that needs its own confirmation.
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

// Moves an existing claimed slot's booking to a different open slot on
// the same signup page (optionally a different shoot type -- a client
// upgrade). Photographer-only (checked server-side via auth.uid()),
// unlike claim_signup_slot which is intentionally public. Conflict
// checking is the DB's own no_overlapping_claimed_slots EXCLUDE
// constraint -- the RPC returns { success: false, error:
// 'conflicts_with_existing_booking' } if the target would overlap another
// claimed slot, rather than this function pre-checking for conflicts itself.
export async function moveSignupSlotBooking(sourceSlotId, targetSlotId, notifyClient = false) {
  const { data, error } = await supabase.rpc('move_signup_slot_booking', {
    p_source_slot_id: sourceSlotId,
    p_target_slot_id: targetSlotId,
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}

// Manually adjusts an already-claimed slot's own start/end time to
// something outside the pre-generated slot grid entirely (e.g. shifting
// 15 minutes to accommodate a late arrival). Takes local date/time
// strings + the page's own timezone, same shape as createManualSlot
// above, rather than raw ISO datetimes -- keeps the timezone conversion
// in one place (zonedTimeToUtc) instead of pushing it onto every caller.
// Same conflict/authorization handling as moveSignupSlotBooking.
export async function updateSignupSlotTime({ slotId, date, startTime, endTime, timezone, notifyClient = false }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = zonedTimeToUtc(date, endTime, timezone)
  const { data, error } = await supabase.rpc('update_signup_slot_time', {
    p_slot_id: slotId,
    p_new_start: start.toISOString(),
    p_new_end: end.toISOString(),
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}
