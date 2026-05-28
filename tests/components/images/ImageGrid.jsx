import ImageCard from './ImageCard.jsx'

export default function ImageGrid({ images, previewUrls, onDelete, selectedIds, onSelect, selectionMode }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {images.map(image => (
        <ImageCard
          key={image.id}
          image={image}
          previewUrl={previewUrls[image.id]}
          onDelete={onDelete}
          selected={selectedIds.has(image.id)}
          onSelect={onSelect}
          selectionMode={selectionMode}
        />
      ))}
    </div>
  )
}
