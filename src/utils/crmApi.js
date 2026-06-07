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

export async function createClient({ firstName, lastName, email, phone, address, city, state, zip, notes, tags }) {
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
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateClient(id, { firstName, lastName, email, phone, address, city, state, zip, notes, tags }) {
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
    .select('id, title, event_name, event_date, is_active, share_token, created_at, cover_image_id, cover_r2_key, gallery_images!cover_image_id(preview_r2_key)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export async function getContracts({ clientId, galleryId } = {}) {
  let query = supabase
    .from('contracts')
    .select('id, title, status, signed_at, photographer_signed_at, sent_at, created_at, client_id, gallery_id, clients(first_name, last_name), galleries(title)')
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)
  if (galleryId) query = query.eq('gallery_id', galleryId)

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

export async function createContractDraft({ clientId, galleryId, templateId, title, body, bodyHash }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      photographer_id: user.id,
      client_id: clientId || null,
      gallery_id: galleryId || null,
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

export function resolveTemplateVariables(body, { photographer, client, gallery } = {}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const eventDate = gallery?.event_date
    ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  const vars = {
    client_name: client ? `${client.first_name} ${client.last_name}` : '',
    client_first_name: client?.first_name ?? '',
    client_email: client?.email ?? '',
    photographer_name: photographer?.display_name ?? '',
    studio_name: photographer?.business_name ?? photographer?.display_name ?? '',
    gallery_title: gallery?.title ?? '',
    event_name: gallery?.event_name ?? '',
    event_date: eventDate,
    today_date: today,
    sign_date: '{{sign_date}}',
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
