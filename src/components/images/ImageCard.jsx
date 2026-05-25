import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export default function ImageCard({ image, previewUrl, onDelete }) {
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e) {
    e.stopPropagation()
    setDeleting(true)
    try { await onDelete(image.id) }
    catch { setDeleting(false) }
  }

  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden group"
      style={{ background: 'var(--surface-raised)' }}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={image.file_name || 'Gallery image'}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Delete overlay */}
      {showDelete && !deleting && (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 p-1.5 rounded-lg transition-opacity"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <Trash2 size={13} className="text-white" />
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
