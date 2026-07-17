import { useState, useEffect } from 'react'
import { FolderOpen, ChevronRight, ArrowLeft, Home } from 'lucide-react'
import { useFolderContext } from '../../contexts/FolderContext.jsx'

// ── Move Picker Modal ───────────────────────────────────────────────────────
// Shared navigable folder picker — browse into folders rather than seeing a
// flat list. Originally lived only inside GalleryCard.jsx for moving
// galleries; extracted so FolderCard.jsx can use the identical UI for
// moving folders, rather than the two pickers looking different.
//
// title:              label for what's being moved (gallery title / folder name)
// currentLocationId:  the item's current folder/parent id (null = top level)
// excludeFolderIds:   Set of folder ids to hide from navigation entirely --
//                      used when moving a folder, to keep it (and its own
//                      descendants) from being offered as a destination
// rootLabel:          confirm-button text when the destination is the top level
// rootBreadcrumbLabel:label for the root breadcrumb crumb
// onConfirm:          async (destinationFolderId) => void -- performs the move
export default function MovePickerModal({
  open, onClose, title, currentLocationId = null,
  excludeFolderIds = new Set(),
  rootLabel = 'Move to Ungrouped',
  rootBreadcrumbLabel = 'Galleries',
  onConfirm,
}) {
  const { folders } = useFolderContext()
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  // Navigation state: stack of { id, name } — empty = at root
  const [navStack, setNavStack] = useState([])

  const currentFolderId = navStack.length > 0 ? navStack[navStack.length - 1].id : null

  useEffect(() => {
    if (open) {
      setNavStack([])
      setLoading(false)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
    }
  }, [open])

  // Folders at the current level, minus anything excluded
  const childFolders = folders
    .filter(f => f.parent_id === currentFolderId && !excludeFolderIds.has(f.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Is the current browse location the item's current location?
  const isCurrentLocation = (currentFolderId ?? null) === (currentLocationId ?? null)

  function handleNavigateInto(folder) {
    setNavStack(prev => [...prev, { id: folder.id, name: folder.name }])
  }

  function handleNavigateUp() {
    setNavStack(prev => prev.slice(0, -1))
  }

  function handleNavigateTo(index) {
    // index = -1 means root
    setNavStack(prev => index < 0 ? [] : prev.slice(0, index + 1))
  }

  async function handleMove() {
    if (isCurrentLocation) { onClose(); return }
    setLoading(true)
    try {
      await onConfirm(currentFolderId)
      onClose()
    } catch (err) {
      console.error('Failed to move:', err)
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', transition: 'background 0.2s ease', backdropFilter: visible ? 'blur(2px)' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 z-50 w-full"
        style={{
          top: '50%',
          transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          maxWidth: 400,
          padding: '0 16px',
        }}
      >
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            {navStack.length > 0 && (
              <button
                onClick={handleNavigateUp}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => handleNavigateTo(-1)}
                  className="text-xs flex items-center gap-1"
                  style={{ color: navStack.length === 0 ? 'var(--text)' : '#6366f1', background: 'none', border: 'none', cursor: navStack.length === 0 ? 'default' : 'pointer', fontWeight: navStack.length === 0 ? 600 : 400 }}
                >
                  <Home size={11} />{rootBreadcrumbLabel}
                </button>
                {navStack.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />
                    <button
                      onClick={() => handleNavigateTo(i)}
                      className="text-xs"
                      style={{ color: i === navStack.length - 1 ? 'var(--text)' : '#6366f1', background: 'none', border: 'none', cursor: i === navStack.length - 1 ? 'default' : 'pointer', fontWeight: i === navStack.length - 1 ? 600 : 400, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                Moving: {title}
              </p>
            </div>
          </div>

          {/* Folder list */}
          <div style={{ minHeight: 120, maxHeight: 280, overflowY: 'auto' }}>
            {childFolders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-1">
                <FolderOpen size={20} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No subfolders here</p>
              </div>
            )}
            {childFolders.map(folder => {
              const hasChildren = folders.some(f => f.parent_id === folder.id && !excludeFolderIds.has(f.id))
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleNavigateInto(folder)}
                >
                  <FolderOpen size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{folder.name}</span>
                  {hasChildren && <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={handleMove}
              disabled={loading || isCurrentLocation}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{
                background: isCurrentLocation ? 'var(--surface-raised)' : '#6366f1',
                color: isCurrentLocation ? 'var(--text-muted)' : '#fff',
                border: 'none',
                cursor: loading || isCurrentLocation ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}>
              {loading ? 'Moving…' : isCurrentLocation ? 'Already here' : currentFolderId === null ? rootLabel : 'Move Here'}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
