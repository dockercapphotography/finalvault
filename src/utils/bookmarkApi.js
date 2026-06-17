import { supabase } from '../supabaseClient.js'

// ── Galleries ────────────────────────────────────────────────────────────────

export async function getBookmarkedGalleries() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('pinned_galleries')
    .select('gallery_id, created_at, galleries(*)')
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(row => row.galleries)
}

export async function bookmarkGallery(galleryId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('pinned_galleries')
    .upsert({ photographer_id: user.id, gallery_id: galleryId }, { onConflict: 'photographer_id,gallery_id' })
  if (error) throw error
}

export async function unbookmarkGallery(galleryId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('pinned_galleries')
    .delete()
    .eq('photographer_id', user.id)
    .eq('gallery_id', galleryId)
  if (error) throw error
}

export async function getBookmarkedGalleryIds() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('pinned_galleries')
    .select('gallery_id')
    .eq('photographer_id', user.id)
  if (error) throw error
  return new Set(data.map(r => r.gallery_id))
}

// ── Images ───────────────────────────────────────────────────────────────────

export async function getBookmarkedImages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('pinned_images')
    .select(`
      image_id, created_at,
      gallery_images (
        id, file_name, preview_r2_key, original_r2_key, watermark_id, updated_at,
        galleries!gallery_images_gallery_id_fkey ( id, title )
      )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(row => ({
    ...row.gallery_images,
    galleryTitle: row.gallery_images?.galleries?.title,
    galleryId: row.gallery_images?.galleries?.id,
  }))
}

export async function bookmarkImage(imageId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('pinned_images')
    .upsert({ photographer_id: user.id, image_id: imageId }, { onConflict: 'photographer_id,image_id' })
  if (error) throw error
}

export async function unbookmarkImage(imageId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('pinned_images')
    .delete()
    .eq('photographer_id', user.id)
    .eq('image_id', imageId)
  if (error) throw error
}

export async function getBookmarkedImageIds() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('pinned_images')
    .select('image_id')
    .eq('photographer_id', user.id)
  if (error) throw error
  return new Set(data.map(r => r.image_id))
}
