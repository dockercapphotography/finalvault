import { supabase } from '../supabaseClient.js'

export async function getImages(galleryId) {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, original_r2_key, preview_r2_key, file_name, file_size, width, height, sort_order, uploaded_at')
    .eq('gallery_id', galleryId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}

export async function addImage(data) {
  const { data: inserted, error } = await supabase
    .from('gallery_images')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return inserted
}

export async function deleteImage(id) {
  const { error } = await supabase
    .from('gallery_images')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function reorderImages(updates) {
  const { error } = await supabase
    .from('gallery_images')
    .upsert(updates.map(({ id, sort_order }) => ({ id, sort_order })))

  if (error) throw error
}
