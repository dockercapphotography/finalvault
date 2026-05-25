import { supabase } from '../supabaseClient.js'

export async function getGalleries() {
  const { data, error } = await supabase
    .from('galleries')
    .select(`
      id, title, client_name, is_active, share_token,
      created_at, updated_at, expires_at,
      cover_image_id,
      gallery_images!cover_image_id (preview_r2_key)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getGallery(id) {
  const { data, error } = await supabase
    .from('galleries')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createGallery({ title, clientName, notes }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('galleries')
    .insert({
      title,
      client_name: clientName,
      notes,
      photographer_id: user.id
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateGallery(id, updates) {
  const { data, error } = await supabase
    .from('galleries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteGallery(id) {
  const { error } = await supabase
    .from('galleries')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getGalleryImageCount(galleryId) {
  const { count, error } = await supabase
    .from('gallery_images')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)

  if (error) throw error
  return count ?? 0
}
