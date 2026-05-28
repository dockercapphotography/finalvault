import GalleryCard from './GalleryCard.jsx'

export default function GalleryGrid({ galleries, onCopyLink }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {galleries.map(gallery => (
        <GalleryCard
          key={gallery.id}
          gallery={gallery}
          onCopyLink={onCopyLink}
        />
      ))}
    </div>
  )
}
