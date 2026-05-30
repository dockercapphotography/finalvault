import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient.js'
import { fetchPreviewObjectUrl } from '../../utils/r2.js'
import GalleryCard from './GalleryCard.jsx'

function useCoverUrls(galleries) {
  const [coverUrls, setCoverUrls] = useState({})

  useEffect(() => {
    if (!galleries?.length) return
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      await Promise.all(galleries.map(async (g) => {
        const key = g.cover_r2_key || g.gallery_images?.preview_r2_key
        if (!key) return
        try {
          const url = await fetchPreviewObjectUrl({ key, token })
          if (!cancelled) setCoverUrls(prev => ({ ...prev, [g.id]: url }))
        } catch {
          // no cover available
        }
      }))
    }

    load()
    return () => { cancelled = true }
  }, [galleries])

  return coverUrls
}

export default function GalleryGrid({ galleries, onCopyLink, bookmarkedIds = new Set() }) {
  const coverUrls = useCoverUrls(galleries)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {galleries.map(gallery => (
        <GalleryCard
          key={gallery.id}
          gallery={gallery}
          coverUrl={coverUrls[gallery.id] || null}
          onCopyLink={onCopyLink}
          isBookmarked={bookmarkedIds.has(gallery.id)}
        />
      ))}
    </div>
  )
}
