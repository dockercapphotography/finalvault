import { useRef, useState } from 'react'
import ImageCard from './ImageCard.jsx'

export default function ImageGrid({
  images, previewUrls, onDelete, coverId, selectedIds, onSelect, selectionMode,
  sets, onMoveToSet, onReWatermark, onDownload, onReorder,
}) {
  const dragIndexRef = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  function handleDragStart(e, index) {
    // Stop the event from bubbling to any parent handlers (e.g. usePageDrop)
    e.stopPropagation()
    dragIndexRef.current = index
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'

    // Use the card's own thumbnail as a clean drag image (no globe)
    const el = e.currentTarget
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2)
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  function handleDrop(e, toIndex) {
    e.preventDefault()
    e.stopPropagation()
    const fromIndex = dragIndexRef.current
    dragIndexRef.current = null
    setDragOverIndex(null)
    setIsDragging(false)
    if (fromIndex === null || fromIndex === toIndex) return
    const reordered = [...images]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    onReorder?.(reordered)
  }

  function handleDragEnd() {
    dragIndexRef.current = null
    setDragOverIndex(null)
    setIsDragging(false)
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {images.map((image, index) => {
        const isBeingDragged = isDragging && dragIndexRef.current === index
        const isDropTarget = dragOverIndex === index && dragIndexRef.current !== index

        return (
          <div
            key={image.id}
            draggable
            onDragStart={e => handleDragStart(e, index)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            style={{
              borderRadius: 8,
              opacity: isBeingDragged ? 0.35 : 1,
              transform: isDropTarget ? 'scale(1.04)' : 'scale(1)',
              outline: isDropTarget ? '3px solid #6366f1' : 'none',
              outlineOffset: 2,
              boxShadow: isDropTarget ? '0 0 0 6px rgba(99,102,241,0.15)' : 'none',
              transition: 'transform 0.12s ease, outline 0.1s, box-shadow 0.1s, opacity 0.15s',
              cursor: isDragging ? 'grabbing' : 'grab',
              zIndex: isDropTarget ? 10 : 'auto',
              position: 'relative',
            }}
          >
            <ImageCard
              image={image}
              previewUrl={previewUrls[image.id]}
              onDelete={onDelete}
              isCover={image.id === coverId}
              selected={selectedIds.has(image.id)}
              onSelect={onSelect}
              selectionMode={selectionMode}
              sets={sets}
              onMoveToSet={onMoveToSet}
              onReWatermark={onReWatermark}
              onDownload={onDownload}
            />
          </div>
        )
      })}
    </div>
  )
}
