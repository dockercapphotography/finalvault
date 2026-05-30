import { useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { generatePreview } from '../utils/imageProcessor.js'
import { uploadToR2, deleteFromR2, buildOriginalKey, buildPreviewKey } from '../utils/r2.js'
import { addImage } from '../utils/imageApi.js'

// Estimate total bytes an upload batch will consume (original + preview)
// Preview is typically 30-50% of original at 1600px/0.80 webp — use 0.4 as estimate
const PREVIEW_SIZE_ESTIMATE = 0.4

async function checkStorageCapacity(photographerId, files) {
  const estimatedBytes = files.reduce((sum, f) => sum + f.size + (f.size * PREVIEW_SIZE_ESTIMATE), 0)

  const [{ data: storageRow }, { data: galleries }] = await Promise.all([
    supabase.from('photographer_storage')
      .select('bytes_used, tier_id, storage_tiers(name, storage_gb)')
      .eq('photographer_id', photographerId)
      .single(),
    supabase.from('galleries').select('id').eq('photographer_id', photographerId),
  ])

  if (!storageRow?.storage_tiers?.storage_gb) {
    // No tier assigned — allow upload
    return { allowed: true }
  }

  const galleryIds = (galleries || []).map(g => g.id)
  let bytesUsed = 0
  if (galleryIds.length > 0) {
    const { data: imgs } = await supabase
      .from('gallery_images')
      .select('file_size, preview_size')
      .in('gallery_id', galleryIds)
      .is('deleted_at', null)
    bytesUsed = (imgs || []).reduce((sum, img) => sum + (img.file_size || 0) + (img.preview_size || 0), 0)
  }

  const limitBytes = storageRow.storage_tiers.storage_gb * 1024 * 1024 * 1024
  const available = limitBytes - bytesUsed

  if (estimatedBytes > available) {
    const fmt = (b) => b >= 1024 ** 3
      ? `${(b / 1024 ** 3).toFixed(2)} GB`
      : `${(b / (1024 * 1024)).toFixed(1)} MB`
    return {
      allowed: false,
      message: `Not enough storage. This upload needs ~${fmt(estimatedBytes)} but you only have ${fmt(Math.max(0, available))} remaining on your ${storageRow.storage_tiers.name} plan (${storageRow.storage_tiers.storage_gb} GB total).`
    }
  }

  return { allowed: true }
}

export function useImageUpload({ galleryId, photographerId, watermark, setId, onComplete }) {
  const [uploadItems, setUploadItems] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [storageError, setStorageError] = useState(null)

  const updateItem = (index, updates) => {
    setUploadItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const uploadFiles = useCallback(async (files) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    // Check storage capacity before starting
    setStorageError(null)
    const capacityCheck = await checkStorageCapacity(photographerId, files)
    if (!capacityCheck.allowed) {
      setStorageError(capacityCheck.message)
      return
    }

    const items = files.map(f => ({
      name: f.name,
      size: f.size,
      status: 'pending',
      error: null,
    }))

    setUploadItems(items)
    setIsUploading(true)

    await Promise.all(files.map(async (file, index) => {
      let originalKey = null
      let previewKey = null
      try {
        const imageId = crypto.randomUUID()
        const ext = file.name.split('.').pop().toLowerCase()

        updateItem(index, { status: 'processing' })
        const previewBlob = await generatePreview(file, watermark)

        updateItem(index, { status: 'uploading' })
        originalKey = buildOriginalKey(photographerId, galleryId, imageId, ext)
        previewKey = buildPreviewKey(photographerId, galleryId, imageId)

        await Promise.all([
          uploadToR2({ file, key: originalKey, token }),
          uploadToR2({
            file: new File([previewBlob], `${imageId}.webp`, { type: 'image/webp' }),
            key: previewKey,
            token
          })
        ])

        const { width, height } = await getImageDimensions(file)

        await addImage({
          id: imageId,
          gallery_id: galleryId,
          photographer_id: photographerId,
          original_r2_key: originalKey,
          preview_r2_key: previewKey,
          file_name: file.name,
          file_size: file.size,
          preview_size: previewBlob.size,
          file_type: file.type || 'application/octet-stream',
          width,
          height,
          sort_order: index,
          set_id: setId || null,
          watermark_id: watermark?.id || null,
        })

        updateItem(index, { status: 'done' })
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err)
        // Clean up any R2 files that made it before the failure
        if (originalKey) deleteFromR2({ key: originalKey, token }).catch(() => {})
        if (previewKey) deleteFromR2({ key: previewKey, token }).catch(() => {})
        updateItem(index, { status: 'error', error: err.message })
      }
    }))

    setIsUploading(false)
    onComplete?.()
  }, [galleryId, photographerId, watermark, setId, onComplete])

  function reset() {
    setUploadItems([])
    setIsUploading(false)
    setStorageError(null)
  }

  return { uploadFiles, uploadItems, isUploading, storageError, reset }
}

async function getImageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}
