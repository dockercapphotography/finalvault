import { supabase } from '../supabaseClient.js'

export async function getSets(galleryId) {
  const { data, error } = await supabase
    .from('gallery_sets')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

export async function createSet(galleryId, name, description = '') {
  const { data: existing } = await supabase
    .from('gallery_sets')
    .select('sort_order')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = existing?.length ? (existing[0].sort_order + 1) : 0
  const { data, error } = await supabase
    .from('gallery_sets')
    .insert({ gallery_id: galleryId, name: name.trim(), description: description.trim(), sort_order: nextOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSet(setId, updates) {
  const { data, error } = await supabase
    .from('gallery_sets')
    .update(updates)
    .eq('id', setId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSet(setId) {
  const { error } = await supabase
    .from('gallery_sets')
    .delete()
    .eq('id', setId)
  if (error) throw error
}

export async function saveSetOrder(setIds) {
  const updates = setIds.map((id, index) => ({ id, sort_order: index }))
  const { error } = await supabase
    .from('gallery_sets')
    .upsert(updates, { onConflict: 'id' })
  if (error) throw error
}

export async function moveImageToSet(imageId, setId) {
  const { error } = await supabase
    .from('gallery_images')
    .update({ set_id: setId })
    .eq('id', imageId)
  if (error) throw error
}

export async function moveImagesToSet(imageIds, setId) {
  const { error } = await supabase
    .from('gallery_images')
    .update({ set_id: setId })
    .in('id', imageIds)
  if (error) throw error
}
