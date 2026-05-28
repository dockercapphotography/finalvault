import { supabase } from '../supabaseClient.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * Fetch all watermarks for the current photographer.
 */
export async function getWatermarks() {
  const { data, error } = await supabase
    .from('watermarks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * Fetch the active watermark for the current photographer.
 * Returns null if none is set.
 */
export async function getActiveWatermark() {
  const { data: profile, error: profileError } = await supabase
    .from('photographers')
    .select('active_watermark_id, watermarks(*)')
    .single()
  if (profileError) throw profileError
  return profile?.watermarks ?? null
}

/**
 * Upload a watermark image to R2 and create a record in Supabase.
 * @param {File} file - The image file to upload
 * @param {string} label - Human-readable label
 * @returns {Promise<object>} The created watermark record
 */
export async function uploadWatermark(file, label = 'My Watermark') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const userId = session.user.id
  const ext = file.name.split('.').pop() || 'png'
  const key = `photographers/${userId}/watermarks/${crypto.randomUUID()}.${ext}`

  const formData = new FormData()
  formData.append('file', file)
  formData.append('key', key)

  const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  })

  const result = await resp.json()
  if (!result.ok) throw new Error(result.error || 'Upload failed')

  // Create Supabase record
  const { data, error } = await supabase
    .from('watermarks')
    .insert({ label, r2_key: key, opacity: 0.3, position: 'bottom-right' })
    .select()
    .single()
  if (error) throw error

  return data
}

/**
 * Update a watermark's settings (label, opacity, position).
 */
export async function updateWatermark(id, updates) {
  const { data, error } = await supabase
    .from('watermarks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Set the active watermark for the current photographer.
 * Pass null to clear the active watermark.
 */
export async function setActiveWatermark(watermarkId) {
  const { error } = await supabase
    .from('photographers')
    .update({ active_watermark_id: watermarkId })
    .eq('id', (await supabase.auth.getUser()).data.user.id)
  if (error) throw error
}

/**
 * Delete a watermark record from Supabase.
 * Note: does not delete the R2 object (can be a cleanup job later).
 */
export async function deleteWatermark(id) {
  const { error } = await supabase
    .from('watermarks')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * Get an authenticated URL to preview a watermark image.
 */
export async function getWatermarkUrl(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  return `${WORKER_URL}/watermark/${encodeURIComponent(r2Key)}?token=${session.access_token}`
}
