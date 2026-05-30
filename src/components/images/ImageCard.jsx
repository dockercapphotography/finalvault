import { useState, useRef } from 'react'
import { Trash2, MoreVertical, Download, FolderInput, Droplets, Maximize2, ImageIcon, Pencil, RefreshCw, Bookmark } from 'lucide-react'
import PortalMenu from '../ui/PortalMenu.jsx'
import { bookmarkImage, unbookmarkImage } from '../../utils/bookmarkApi.js'

export default function ImageCard({
  image, previewUrl, onDelete, isCover, selected, onSelect,
  sets, onMoveToSet, onReWatermark, onDownload,
  onSetAsCover, onRename, onReplace, onOpen,
  isBookmarked: initialBookmarked = false,
  simplified = false,
  onUnbookmark,
}) {
  const [hovered, setHovered] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [renameValue, setRenameValue] = useState('')
  const replaceInputRef = useRef(null)

  async function handleDelete() {
    setDeleting(true)
    try { await onDelete(image.id) }
    catch { setDeleting(false) }
  }

  function handleOpen() {
    onOpen?.(image)
  }

  function handleStartRename() {
    setRenameValue(image.file_name || '')
    setRenaming(true)
  }

  async function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === image.file_name) { setRenaming(false); return }
    try { await onRename?.(image.id, trimmed) }
    catch {}
    setRenaming(false)
  }

  function handleReplaceClick() {
    replaceInputRef.current?.click()
  }

  async function handleToggleBookmark() {
    try {
      if (bookmarked) {
        await unbookmarkImage(image.id)
        setBookmarked(false)
        onUnbookmark?.()
      } else {
        await bookmarkImage(image.id)
        setBookmarked(true)
      }
    } catch (err) { console.error(err) }
  }

  async function handleReplaceFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await onReplace?.(image, file)
  }

  // Sets this image can actually move to (excludes its current set)
  const movableSets = sets?.filter(s => s.id !== image.set_id) ?? []

  const simplifiedMenuItems = [
    {
      label: 'Open',
      icon: <Maximize2 size={13} />,
      onClick: handleOpen,
    },
    { type: 'divider' },
    {
      label: 'Download',
      icon: <Download size={13} />,
      children: [
        { label: 'Web Size', onClick: () => onDownload?.(image, false) },
        { label: 'Original', onClick: () => onDownload?.(image, true) },
      ],
    },
    {
      label: bookmarked ? 'Remove Bookmark' : 'Bookmark',
      icon: <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />,
      onClick: handleToggleBookmark,
    },
  ]

  const menuItems = [
    {
      label: 'Open',
      icon: <Maximize2 size={13} />,
      onClick: handleOpen,
    },
    { type: 'divider' },
    {
      label: 'Download',
      icon: <Download size={13} />,
      children: [
        { label: 'Web Size', onClick: () => onDownload?.(image, false) },
        { label: 'Original', onClick: () => onDownload?.(image, true) },
      ],
    },
    ...(movableSets.length > 0 ? [{
      label: 'Move to Set',
      icon: <FolderInput size={13} />,
      children: movableSets.map(s => ({
        label: s.name,
        onClick: () => onMoveToSet?.(image.id, s.id),
      })),
    }] : []),
    { type: 'divider' },
    {
      label: 'Set as Cover',
      icon: <ImageIcon size={13} />,
      onClick: () => onSetAsCover?.(image),
    },
    {
      label: 'Rename',
      icon: <Pencil size={13} />,
      onClick: handleStartRename,
    },
    {
      label: 'Replace Photo',
      icon: <RefreshCw size={13} />,
      onClick: handleReplaceClick,
    },
    ...(onReWatermark ? [{
      label: 'Watermark',
      icon: <Droplets size={13} />,
      onClick: () => onReWatermark(image),
    }] : []),
    {
      label: bookmarked ? 'Remove Bookmark' : 'Bookmark',
      icon: <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />,
      onClick: handleToggleBookmark,
    },
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
      onClick={() => !renaming && onSelect(image.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
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

      {/* Bookmark toggle */}
      <button
        onClick={e => { e.stopPropagation(); handleToggleBookmark() }}
        className="absolute bottom-2 right-2"
        style={{
          zIndex: 10,
          background: bookmarked ? '#6366f1' : 'rgba(0,0,0,0.45)',
          border: 'none',
          borderRadius: '50%',
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          transition: 'background 0.15s',
        }}>
        <Bookmark size={12} color="#fff" fill={bookmarked ? '#fff' : 'none'} />
      </button>

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
            items={simplified ? simplifiedMenuItems : menuItems}
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

      {/* Hidden file input for Replace Photo */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceFile}
      />

      {/* Inline rename overlay */}
      {renaming && (
        <div
          className="absolute inset-0 flex items-end justify-center pb-2 px-2"
          style={{ zIndex: 60, background: 'rgba(0,0,0,0.55)', borderRadius: 8 }}
          onClick={e => e.stopPropagation()}
        >
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') setRenaming(false)
            }}
            onBlur={handleRenameSubmit}
            className="w-full text-xs rounded-lg px-2 py-1.5 text-center"
            style={{
              background: 'rgba(255,255,255,0.95)',
              border: '2px solid #6366f1',
              color: '#111',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
