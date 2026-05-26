import GalleryCard from './GalleryCard.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function getCoverUrl(gallery) {
  // Separately uploaded cover image
  if (gallery.cover_r2_key) {
    return `${WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}`
  }
  // Cover picked from gallery images
  if (gallery.gallery_images?.preview_r2_key) {
    return `${WORKER_URL}/preview/${encodeURIComponent(gallery.gallery_images.preview_r2_key)}`
  }
  return null
}

export default function GalleryGrid({ galleries, onCopyLink }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {galleries.map(gallery => (
        <GalleryCard
          key={gallery.id}
          gallery={gallery}
          coverUrl={getCoverUrl(gallery)}
          onCopyLink={onCopyLink}
        />
      ))}
    </div>
  )
}
