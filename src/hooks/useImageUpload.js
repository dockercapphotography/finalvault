import { useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'
import { generatePreview } from '../utils/imageProcessor.js'
import { uploadToR2, buildOriginalKey, buildPreviewKey } from '../utils/r2.js'
import { addImage } from '../utils/imageApi.js'

export function useImageUpload({ galleryId, photographerId, watermark, setId, onComplete }) {
  const [uploadItems, setUploadItems] = useState([])
  const [isUploading, setIsUploading] = useState(false)

  const updateItem = (index, updates) => {
    setUploadItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const uploadFiles = useCallback(async (files) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const items = files.map(f => ({
      name: f.name,
      size: f.size,
      status: 'pending',
      error: null,
    }))

    setUploadItems(items)
    setIsUploading(true)

    await Promise.all(files.map(async (file, index) => {
      try {
        const imageId = crypto.randomUUID()
        const ext = file.name.split('.').pop().toLowerCase()

        updateItem(index, { status: 'processing' })
        const previewBlob = await generatePreview(file, watermark)

        updateItem(index, { status: 'uploading' })
        const originalKey = buildOriginalKey(photographerId, galleryId, imageId, ext)
        const previewKey = buildPreviewKey(photographerId, galleryId, imageId)

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
          file_type: file.type || 'application/octet-stream',
          width,
          height,
          sort_order: index,
          set_id: setId || null,
        })

        updateItem(index, { status: 'done' })
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err)
        updateItem(index, { status: 'error', error: err.message })
      }
    }))

    setIsUploading(false)
    onComplete?.()
  }, [galleryId, photographerId, watermark, setId, onComplete])

  function reset() {
    setUploadItems([])
    setIsUploading(false)
  }

  return { uploadFiles, uploadItems, isUploading, reset }
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
