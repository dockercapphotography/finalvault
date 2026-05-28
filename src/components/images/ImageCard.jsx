import { useState, useRef, useEffect } from 'react'
import { Trash2, MoreVertical, Download, FolderInput, Droplets } from 'lucide-react'

export default function ImageCard({
  image, previewUrl, onDelete, isCover, selected, onSelect, selectionMode,
  sets, onMoveToSet, onReWatermark, onDownload,
}) {
  const [hovered, setHovered] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) { setShowMoveMenu(false); setShowDownloadMenu(false); return }
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setMenuOpen(false)
        setShowMoveMenu(false)
        setShowDownloadMenu(false)
      }
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [menuOpen])

  async function handleDelete(e) {
    e.stopPropagation()
    setDeleting(true)
    try { await onDelete(image.id) }
    catch { setDeleting(false) }
  }

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
      {/* Image container — clipped separately so menu can overflow */}
      <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
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

      {/* Context menu */}
      {(hovered || menuOpen) && !deleting && (
        <div
          ref={menuRef}
          className="absolute top-2 right-2"
          style={{ zIndex: 50 }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            className="p-1.5 rounded-lg"
            style={{ background: 'rgba(0,0,0,0.65)', cursor: 'pointer' }}>
            <MoreVertical size={12} className="text-white" />
          </button>

          {menuOpen && (
            <div
              className="absolute top-full mt-1 rounded-xl shadow-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160, zIndex: 100, left: '50%', transform: 'translateX(-50%)' }}
            >
              {/* Download */}
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowDownloadMenu(p => !p); setShowMoveMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Download size={13} style={{ color: 'var(--text-muted)' }} />
                  Download
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-full top-0 mr-1 rounded-xl shadow-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 130, zIndex: 110 }}>
                    <button
                      onClick={e => { e.stopPropagation(); onDownload?.(image, false); setMenuOpen(false) }}
                      className="w-full flex items-center px-3 py-2.5 text-sm text-left"
                      style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      Web Size
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDownload?.(image, true); setMenuOpen(false) }}
                      className="w-full flex items-center px-3 py-2.5 text-sm text-left"
                      style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      Original
                    </button>
                  </div>
                )}
              </div>

              {/* Move to Set */}
              {sets?.length > 0 && (
                <div className="relative">
                  <button
                    onClick={e => { e.stopPropagation(); setShowMoveMenu(p => !p); setShowDownloadMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                    style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <FolderInput size={13} style={{ color: 'var(--text-muted)' }} />
                    Move to Set
                  </button>
                  {showMoveMenu && (
                    <div className="absolute right-full top-0 mr-1 rounded-xl shadow-xl overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 130, zIndex: 110 }}>
                      {sets.filter(s => s.id !== image.set_id).map(s => (
                        <button key={s.id}
                          onClick={e => { e.stopPropagation(); onMoveToSet?.(image.id, s.id); setMenuOpen(false) }}
                          className="w-full flex items-center px-3 py-2.5 text-sm text-left truncate"
                          style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Re-watermark */}
              {onReWatermark && (
                <button
                  onClick={e => { e.stopPropagation(); onReWatermark?.(image); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Droplets size={13} style={{ color: 'var(--text-muted)' }} />
                  Re-watermark
                </button>
              )}

              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
