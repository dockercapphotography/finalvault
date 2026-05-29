import { supabase } from '../supabaseClient.js'

export async function getGalleryTemplates() {
  const { data, error } = await supabase
    .from('gallery_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createGalleryTemplate(fields) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('gallery_templates')
    .insert({ photographer_id: user.id, ...normalise(fields), is_builtin: false })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGalleryTemplate(id, fields) {
  const { data, error } = await supabase
    .from('gallery_templates')
    .update({ ...normalise(fields), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteGalleryTemplate(id) {
  const { error } = await supabase.from('gallery_templates').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateGalleryTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()
  const { id, created_at, updated_at, is_builtin, sort_order, photographer_id, ...rest } = template
  const { data, error } = await supabase
    .from('gallery_templates')
    .insert({ ...rest, photographer_id: user.id, name: `${template.name} (Copy)`, is_builtin: false })
    .select()
    .single()
  if (error) throw error
  return data
}

// Convert camelCase fields to snake_case for DB
function normalise({
  name, themeColor, gridSize, gridSpacing, sets,
  requirePassword, requireDownloadPin,
  allowDownloads, downloadWatermarked, allowHiresDownload,
  allowFavorites, allowComments, watermarkId,
}) {
  return {
    name: name?.trim(),
    theme_color: themeColor,
    grid_size: gridSize,
    grid_spacing: gridSpacing,
    sets: sets?.filter(s => s.trim()),
    require_password: requirePassword ?? false,
    require_download_pin: requireDownloadPin ?? false,
    allow_downloads: allowDownloads ?? true,
    download_watermarked: downloadWatermarked ?? false,
    allow_hires_download: allowHiresDownload ?? false,
    allow_favorites: allowFavorites ?? true,
    allow_comments: allowComments ?? true,
    watermark_id: watermarkId || null,
  }
}
