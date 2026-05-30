import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { fetchPreviewObjectUrl } from '../utils/r2.js'

// No module-level cache needed — updated_at from the DB is the source of truth.
// The browser's HTTP cache handles repeated fetches efficiently.

// Kept for API compatibility with GalleryDetail — no-op now.
export function updatePreviewCache(r2Key, blobUrl) {}

export function usePreviewUrls(images) {
  const [previewUrls, setPreviewUrls] = useState({})

  useEffect(() => {
    if (!images?.length) return
    let cancelled = false

    async function loadPreviews() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      await Promise.all(images.map(async (image) => {
        if (!image.preview_r2_key) return

        // Use updated_at as the cache-bust — changes whenever the image is re-watermarked.
        // This forces a fresh fetch from R2 when the image has changed, and lets the
        // browser HTTP cache serve unchanged images efficiently.
        const cacheBust = image.updated_at || null

        try {
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
    return () => { cancelled = true }
  }, [images])

  return { previewUrls, setPreviewUrls }
}
