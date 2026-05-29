import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { fetchPreviewObjectUrl } from '../utils/r2.js'

// cacheBusts: optional { [imageId]: timestamp } map — forces a fresh R2 fetch
// for images that have been re-watermarked, bypassing the immutable cache header
export function usePreviewUrls(images, cacheBusts = {}) {
  const [previewUrls, setPreviewUrls] = useState({})

  useEffect(() => {
    if (!images?.length) return

    let cancelled = false

    async function loadPreviews() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      await Promise.all(images.map(async (image) => {
        if (!image.preview_r2_key) return
        try {
          const cacheBust = cacheBusts[image.id] || null
          const url = await fetchPreviewObjectUrl({ key: image.preview_r2_key, token, cacheBust })
          if (!cancelled) {
            setPreviewUrls(prev => ({ ...prev, [image.id]: url }))
          }
        } catch (err) {
          console.warn(`Failed to load preview for ${image.id}:`, err)
        }
      }))
    }

    loadPreviews()

    return () => {
      cancelled = true
      Object.values(previewUrls).forEach(url => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [images, cacheBusts])

  return { previewUrls, setPreviewUrls }
}
