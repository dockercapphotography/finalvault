import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient.js'
import GalleryCard from './GalleryCard.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Use direct ?token= URLs instead of blob URLs so the browser HTTP cache works
// across page refreshes — blob URLs bypass browser caching entirely
function useCoverUrls(galleries) {
  const [token, setToken] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token || null)
    })
  }, [])

  if (!token) return {}

  const coverUrls = {}
  for (const g of galleries) {
    const key = g.cover_r2_key || g.gallery_images?.preview_r2_key
    if (key) coverUrls[g.id] = `${WORKER_URL}/preview/${encodeURIComponent(key)}?token=${token}`
  }
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
