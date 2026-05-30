import { supabase } from '../supabaseClient.js'

export async function getImages(galleryId) {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, original_r2_key, preview_r2_key, file_name, file_size, width, height, sort_order, uploaded_at, set_id, watermark_id, watermarks(r2_key, opacity, position, scale)')
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

export async function saveImageOrder(orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('gallery_images')
        .update({ sort_order: index })
        .eq('id', id)
    )
  )
  const failed = results.filter(r => r.error)
  if (failed.length > 0) throw new Error(failed[0].error.message)
}

export async function updateImageWatermark(imageId, watermarkId) {
  const { error } = await supabase
    .from('gallery_images')
    .update({ watermark_id: watermarkId })
    .eq('id', imageId)
  if (error) throw error
}
