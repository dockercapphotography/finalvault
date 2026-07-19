import { supabase } from '../supabaseClient.js'

// ── Clients ───────────────────────────────────────────────────────────────────

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getClient(id) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createClient({ firstName, lastName, email, phone, address, city, state, zip, notes, tags, pronouns }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      photographer_id: user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      notes: notes?.trim() || null,
      tags: tags?.length ? tags : null,
      pronouns: pronouns || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateClient(id, { firstName, lastName, email, phone, address, city, state, zip, notes, tags, pronouns }) {
  const updates = { updated_at: new Date().toISOString() }
  if (firstName !== undefined) updates.first_name = firstName.trim()
  if (lastName !== undefined) updates.last_name = lastName.trim()
  if (email !== undefined) updates.email = email?.trim() || null
  if (phone !== undefined) updates.phone = phone?.trim() || null
  if (address !== undefined) updates.address = address?.trim() || null
  if (city !== undefined) updates.city = city?.trim() || null
  if (state !== undefined) updates.state = state?.trim() || null
  if (zip !== undefined) updates.zip = zip?.trim() || null
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (tags !== undefined) updates.tags = tags?.length ? tags : null
  if (pronouns !== undefined) updates.pronouns = pronouns || null

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteClient(id) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getClientGalleries(clientId) {
  const { data, error } = await supabase
    .from('galleries')
    .select('id, title, event_name, event_date, is_active, share_token, created_at, cover_image_id, cover_r2_key, gallery_images!cover_image_id(preview_r2_key), gallery_clients!inner(client_id)')
    .eq('gallery_clients.client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export async function getContracts({ clientId, galleryId, sessionId } = {}) {
  let query = supabase
    .from('contracts')
    .select('id, title, status, signed_at, photographer_signed_at, sent_at, created_at, client_id, gallery_id, session_id, clients(first_name, last_name), galleries(title)')
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)
  if (galleryId) query = query.eq('gallery_id', galleryId)
  if (sessionId) query = query.eq('session_id', sessionId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getContract(id) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*, clients(*), galleries(id, title, event_name, event_date)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createContractDraft({ clientId, galleryId, sessionId, templateId, title, body, bodyHash }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      photographer_id: user.id,
      client_id: clientId || null,
      gallery_id: galleryId || null,
      session_id: sessionId || null,
      template_id: templateId || null,
      title,
      body,
      body_hash: bodyHash,
      status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateContract(id, updates) {
  const { data, error } = await supabase
    .from('contracts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteContract(id) {
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function voidContract(id, reason = '') {
  const { data, error } = await supabase
    .from('contracts')
    .update({
      status: 'void',
      void_at: new Date().toISOString(),
      void_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Contract Templates ────────────────────────────────────────────────────────

export async function getContractTemplates() {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getContractTemplate(id) {
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createContractTemplate({ name, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({
      photographer_id: user.id,
      name: name.trim(),
      body: body.trim(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateContractTemplate(id, { name, body }) {
  const updates = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (body !== undefined) updates.body = body.trim()

  const { data, error } = await supabase
    .from('contract_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function duplicateContractTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({
      photographer_id: user.id,
      name: `${template.name} (Copy)`,
      body: template.body,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteContractTemplate(id) {
  const { error } = await supabase
    .from('contract_templates')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ── Variable resolution ───────────────────────────────────────────────────────

export function resolveTemplateVariables(body, { photographer, client, gallery, session } = {}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const eventDate = gallery?.event_date
    ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : session?.session_date
      ? new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : ''

  const photographerAddress = [
    photographer?.business_address,
    photographer?.business_city,
    photographer?.business_state,
    photographer?.business_zip,
  ].filter(Boolean).join(', ')

  const clientAddress = [
    client?.address,
    client?.city,
    client?.state,
    client?.zip,
  ].filter(Boolean).join(', ')

  const fmtDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const fmtMoney = (v) => v != null ? `$${parseFloat(v).toFixed(2)}` : ''

  const vars = {
    client_name: client ? `${client.first_name} ${client.last_name}` : '',
    client_first_name: client?.first_name ?? '',
    client_email: client?.email ?? '',
    client_address: clientAddress,
    photographer_name: photographer?.display_name ?? '',
    studio_name: photographer?.business_name ?? photographer?.display_name ?? '',
    photographer_email: photographer?.business_email ?? '',
    photographer_phone: photographer?.business_phone ?? '',
    photographer_address: photographerAddress,
    governing_state: photographer?.governing_state ?? '',
    gallery_title: gallery?.title ?? '',
    event_name: gallery?.event_name ?? session?.name ?? '',
    event_date: eventDate,
    today_date: today,
    sign_date: '{{sign_date}}',
    session_name: session?.name ?? '',
    session_type: session?.type ?? '',
    session_date: session?.session_date ? fmtDate(session.session_date) : '',
    session_time: session?.start_time
      ? (() => {
          const fmt = t => { const [h, m] = t.split(':'); const hour = parseInt(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}` }
          return fmt(session.start_time) + (session.end_time ? ` – ${fmt(session.end_time)}` : '')
        })()
      : '',
    session_location: session?.location ?? '',
    session_fee: fmtMoney(session?.session_fee),
    retainer_amount: fmtMoney(session?.retainer_amount),
    balance_due: fmtMoney(session?.balance_due),
    balance_due_date: session?.balance_due_date ? fmtDate(session.balance_due_date) : '',
    cancellation_days: '',
  }

  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  })
}

export async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function clientFullName(client) {
  if (!client) return ''
  return `${client.first_name} ${client.last_name}`.trim()
}

// ── Client avatar ─────────────────────────────────────────────────────────────

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Upload a client avatar image to R2 and update the client record.
 */
export async function uploadClientAvatar(clientId, photographerId, file) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const key = `photographers/${photographerId}/clients/${clientId}.${ext}`

  const formData = new FormData()
  formData.append('file', file)
  formData.append('key', key)

  const resp = await fetch(`${WORKER_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  })
  const result = await resp.json()
  if (!result.ok) throw new Error(result.error || 'Upload failed')

  // Save key to client record
  const { data, error } = await supabase
    .from('clients')
    .update({ avatar_r2_key: key, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch a client avatar as an object URL for use in <img src>.
 * Returns null if no avatar is set.
 */
export async function getClientAvatarUrl(avatarR2Key, sessionToken) {
  if (!avatarR2Key) return null
  try {
    const resp = await fetch(
      `${WORKER_URL}/original/${encodeURIComponent(avatarR2Key)}`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    )
    if (!resp.ok) return null
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export async function getAllTags(photographerId) {
  const { data, error } = await supabase
    .from('clients')
    .select('tags')
    .eq('photographer_id', photographerId)
  if (error) throw error
  const all = (data || []).flatMap(r => r.tags || [])
  return [...new Set(all)].sort()
}

// ── Client Portal ─────────────────────────────────────────────────────────────

/**
 * Returns the client's existing portal_token, or generates and saves a new
 * one if none exists yet. Tokens are generated lazily -- most clients won't
 * need a portal link, so there's no reason to mint one for every row.
 */
export async function getOrCreatePortalToken(clientId) {
  const { data: existing, error: fetchError } = await supabase
    .from('clients')
    .select('portal_token')
    .eq('id', clientId)
    .single()
  if (fetchError) throw fetchError
  if (existing?.portal_token) return existing.portal_token

  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('clients')
    .update({ portal_token: token, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('portal_token')
    .single()
  if (error) throw error
  return data.portal_token
}

/**
 * Overwrites the client's portal_token with a fresh one, immediately
 * invalidating any previously shared link. Caller is responsible for
 * confirming with the photographer before calling this -- it's destructive
 * to the old link with no undo.
 */
export async function regeneratePortalToken(clientId) {
  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('clients')
    .update({ portal_token: token, updated_at: new Date().toISOString() })
    .eq('id', clientId)
    .select('portal_token')
    .single()
  if (error) throw error
  return data.portal_token
}

/**
 * Sets (or changes) the password gating a client's portal access. Runs
 * through the set_client_portal_password RPC, which hashes server-side via
 * pgcrypto and verifies photographer ownership before writing -- never
 * hashes client-side and never returns the hash to the caller. Also resets
 * any existing lockout state, since a new password invalidates whatever the
 * old lockout was protecting.
 */
export async function setClientPortalPassword(clientId, password) {
  const { data, error } = await supabase.rpc('set_client_portal_password', {
    p_client_id: clientId,
    p_password: password,
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error === 'not_authorized' ? 'Not authorized to update this client.' : 'Failed to set portal password.')
  return data
}

/**
 * Removes portal password protection entirely, reverting the client's
 * portal link to token-only access. Same RPC as setClientPortalPassword --
 * passing an empty password clears the gate instead of setting one.
 */
export async function clearClientPortalPassword(clientId) {
  return setClientPortalPassword(clientId, '')
}

/**
 * Manually clears a client's portal lockout state (failed attempt counter
 * and any active escalating-delay window). This is the photographer's
 * escape hatch for a client who's genuinely locked out and can't wait --
 * time-based decay handles the rest on its own.
 */
export async function resetPortalLockout(clientId) {
  const { error } = await supabase
    .from('clients')
    .update({
      portal_password_attempts: 0,
      portal_password_locked_until: null,
      portal_password_last_attempt_at: null,
    })
    .eq('id', clientId)
  if (error) throw error
}
