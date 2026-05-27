import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export default function ImageCard({ image, previewUrl, onDelete, isCover, selected, onSelect, selectionMode }) {
  const [hovered, setHovered] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    setDeleting(true)
    try { await onDelete(image.id) }
    catch { setDeleting(false) }
  }

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden transition-all"
      style={{
        background: 'var(--surface-raised)',
        outline: selected ? '3px solid #6366f1' : isCover ? '3px solid #f59e0b' : hovered ? '3px solid rgba(99,102,241,0.4)' : '3px solid transparent',
        outlineOffset: '2px',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(image.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={image.file_name || 'Gallery image'}
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {isCover && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-medium"
          style={{ background: '#f59e0b', color: '#fff' }}>
          Cover
        </div>
      )}

      {hovered && !selectionMode && !selected && !deleting && (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 p-1.5 rounded-lg"
          style={{ background: 'rgba(0,0,0,0.65)', cursor: 'pointer' }}
        >
          <Trash2 size={12} className="text-white" />
        </button>
      )}

      {deleting && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-white" />
        </div>
      )}
    </div>
  )
}
