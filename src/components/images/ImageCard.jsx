import { useState } from 'react'
import { Trash2, MoreVertical, Download, FolderInput, Droplets } from 'lucide-react'
import PortalMenu from '../ui/PortalMenu.jsx'

export default function ImageCard({
  image, previewUrl, onDelete, isCover, selected, onSelect,
  sets, onMoveToSet, onReWatermark, onDownload,
}) {
  const [hovered, setHovered] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try { await onDelete(image.id) }
    catch { setDeleting(false) }
  }

  // Sets this image can actually move to (excludes its current set)
  const movableSets = sets?.filter(s => s.id !== image.set_id) ?? []

  const menuItems = [
    {
      label: 'Download',
      icon: <Download size={13} />,
      children: [
        { label: 'Web Size', onClick: () => onDownload?.(image, false) },
        { label: 'Original', onClick: () => onDownload?.(image, true) },
      ],
    },
    // Only show Move to Set if there are other sets to move to
    ...(movableSets.length > 0 ? [{
      label: 'Move to Set',
      icon: <FolderInput size={13} />,
      children: movableSets.map(s => ({
        label: s.name,
        onClick: () => onMoveToSet?.(image.id, s.id),
      })),
    }] : []),
    ...(onReWatermark ? [{
      label: 'Watermark',
      icon: <Droplets size={13} />,
      onClick: () => onReWatermark(image),
    }] : []),
    { type: 'divider' },
    {
      label: 'Delete',
      icon: <Trash2 size={13} />,
      danger: true,
      onClick: handleDelete,
    },
  ]

  const outline = selected
    ? '3px solid #6366f1'
    : isCover
    ? '3px solid #f59e0b'
    : hovered
    ? '3px solid rgba(99,102,241,0.4)'
    : '3px solid transparent'

  return (
    <div
      className="relative aspect-square transition-all"
      style={{ outline, outlineOffset: 2, borderRadius: 8, cursor: 'pointer' }}
      onClick={() => onSelect(image.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image — clipped separately so menu can escape */}
      <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={image.file_name || 'Gallery image'}
            className="w-full h-full"
            style={{ objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
            onDragStart={e => e.preventDefault()}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
          </div>
        )}
        {deleting && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-white" />
          </div>
        )}
      </div>

      {/* Cover badge */}
      {isCover && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-medium"
          style={{ background: '#f59e0b', color: '#fff', zIndex: 10 }}>
          Cover
        </div>
      )}

      {/* ••• context menu */}
      {!deleting && (
        <div
          className="absolute top-2 right-2"
          style={{
            zIndex: 50,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            pointerEvents: hovered ? 'auto' : 'none',
          }}
          onClick={e => e.stopPropagation()}
        >
          <PortalMenu
            items={menuItems}
            trigger={
              <button
                className="p-1.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.65)', cursor: 'pointer', border: 'none' }}>
                <MoreVertical size={12} className="text-white" />
              </button>
            }
          />
        </div>
      )}
    </div>
  )
}
