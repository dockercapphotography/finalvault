import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Images, Lock, Clock, Bookmark, MoreVertical, FolderInput, Link, Trash2, FolderOpen, ChevronRight, ArrowLeft, Home } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import Badge from '../ui/Badge.jsx'
import { formatDate } from '../../utils/formatters.js'
import { bookmarkGallery, unbookmarkGallery } from '../../utils/bookmarkApi.js'
import { moveGalleryToFolder, deleteGallery } from '../../utils/galleryApi.js'
import { useFolderContext } from '../../contexts/FolderContext.jsx'

// ── Move to Folder Modal ──────────────────────────────────────────────────────
// Navigable folder picker — browse into folders rather than seeing a flat list.

function MoveFolderModal({ open, onClose, gallery, onMoved }) {
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

  // Folders at the current level
  const childFolders = folders
    .filter(f => f.parent_id === currentFolderId)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Is the current location the gallery's current folder?
  const isCurrentLocation = (currentFolderId ?? null) === (gallery.folder_id ?? null)

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
      await moveGalleryToFolder(gallery.id, currentFolderId)
      onMoved(gallery.id, currentFolderId)
      onClose()
    } catch (err) {
      console.error('Failed to move gallery:', err)
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
                  <Home size={11} />Galleries
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
                Moving: {gallery.title}
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
              const hasChildren = folders.some(f => f.parent_id === folder.id)
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
              {loading ? 'Moving…' : isCurrentLocation ? 'Already here' : currentFolderId === null ? 'Move to Ungrouped' : 'Move Here'}
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

// ── Gallery Card ──────────────────────────────────────────────────────────────

export default function GalleryCard({ gallery, coverUrl, onCopyLink, isBookmarked: initialBookmarked = false }) {
  const navigate = useNavigate()
  const { onGalleryMoved, onGalleryDeleted, onCopyLink: ctxCopyLink, folderPath = [] } = useFolderContext()

  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [bookmarking, setBookmarking] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef(null)
  const mobileMenuRef = useRef(null)

  // dnd-kit draggable — desktop (mouse) only
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: gallery.id,
    data: { type: 'gallery', gallery },
  })

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (!menuRef.current?.contains(e.target) && !mobileMenuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive' : isExpired ? 'expired' : 'active'
  const statusBadge = {
    active:   <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired:  <Badge variant="danger">Expired</Badge>,
  }

  const metaLine = [
    gallery.event_name,
    gallery.event_date && formatDate(gallery.event_date),
  ].filter(Boolean).join(' · ')

  async function handleBookmark(e) {
    e.stopPropagation()
    if (bookmarking) return
    setBookmarking(true)
    try {
      if (bookmarked) { await unbookmarkGallery(gallery.id); setBookmarked(false) }
      else { await bookmarkGallery(gallery.id); setBookmarked(true) }
    } catch (err) { console.error(err) }
    finally { setBookmarking(false) }
  }

  function handleCopyLink(e) {
    e.stopPropagation()
    setMenuOpen(false)
    const copyFn = onCopyLink || ctxCopyLink
    copyFn?.(gallery.share_token)
  }

  async function handleDelete(e) {
    e.stopPropagation()
    setDeleting(true)
    try {
      await deleteGallery(gallery.id)
      onGalleryDeleted?.(gallery.id)
    } catch (err) {
      console.error('Failed to delete gallery:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // When DragOverlay is used, the original card just fades in place
  const dragStyle = {
    opacity: isDragging ? 0.3 : 1,
    transition: 'opacity 0.15s',
  }

  return (
    <>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={{ ...dragStyle, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'pointer', position: 'relative', touchAction: 'none' }}
        className="transition-all hover:shadow-md hidden md:block"
        onClick={() => !menuOpen && !confirmDelete && !isDragging && navigate(`/galleries/${gallery.id}`, { state: { folderPath } })}
        onMouseEnter={e => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={e => { if (!isDragging) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {/* Cover */}
        <div className="aspect-[4/3] relative overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--surface-raised)' }}>
          {coverUrl ? (
            <img src={coverUrl} alt={gallery.title} className="w-full h-full" style={{ objectFit: 'cover' }} />
          ) : (
            <Images size={28} style={{ color: 'var(--text-muted)' }} />
          )}

          <div className="absolute top-3 left-3">{statusBadge[status]}</div>

          {/* Bookmark */}
          <button
            onClick={handleBookmark}
            onPointerDown={e => e.stopPropagation()}
            className="absolute bottom-3 right-3 p-1.5 rounded-full transition-all"
            style={{
              background: bookmarked ? '#6366f1' : 'rgba(0,0,0,0.45)',
              color: '#fff', border: 'none', cursor: 'pointer',
              backdropFilter: 'blur(4px)', opacity: bookmarking ? 0.6 : 1,
              zIndex: 10,
            }}>
            <Bookmark size={13} fill={bookmarked ? '#fff' : 'none'} />
          </button>

          {gallery.require_password && (
            <div className="absolute top-3 right-3 p-1.5 rounded-full" style={{ background: 'var(--surface)' }}>
              <Lock size={11} style={{ color: 'var(--text-muted)' }} />
            </div>
          )}

          {/* ⋮ menu */}
          <div
            ref={menuRef}
            className="absolute top-3"
            style={{ right: gallery.require_password ? 40 : 12, zIndex: 10 }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false) }}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: menuOpen ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
                color: '#fff', border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)',
              }}
            >
              <MoreVertical size={13} />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-30"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 170 }}
              >
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); setMoveModalOpen(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FolderInput size={13} />Move to Folder
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Link size={13} />Copy Link
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                  style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-subtle)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Trash2 size={13} />Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {confirmDelete ? (
            <div onClick={e => e.stopPropagation()} className="space-y-2">
              <p className="text-xs leading-snug" style={{ color: 'var(--text)' }}>
                Delete <span className="font-semibold">"{gallery.title}"</span>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                  disabled={deleting}
                  className="flex-1 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-medium text-sm truncate mb-0.5" style={{ color: 'var(--text)' }}>{gallery.title}</h3>
              {gallery.client_name && (
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{gallery.client_name}</p>
              )}
              {metaLine && (
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{metaLine}</p>
              )}
              {!metaLine && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDate(gallery.created_at)}</p>
              )}
              {gallery.expires_at && !isExpired && (
                <span className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--warning)' }}>
                  <Clock size={11} />Expires {formatDate(gallery.expires_at)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile card — identical but not draggable (touch conflicts with scroll) */}
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', cursor: 'pointer' }}
        className="transition-all hover:shadow-md block md:hidden"
        onClick={() => !menuOpen && !confirmDelete && navigate(`/galleries/${gallery.id}`, { state: { folderPath } })}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <div className="aspect-[4/3] relative overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-raised)' }}>
          {coverUrl ? <img src={coverUrl} alt={gallery.title} className="w-full h-full" style={{ objectFit: 'cover' }} /> : <Images size={28} style={{ color: 'var(--text-muted)' }} />}
          <div className="absolute top-3 left-3">{statusBadge[status]}</div>
          <button onClick={handleBookmark} className="absolute bottom-3 right-3 p-1.5 rounded-full transition-all" style={{ background: bookmarked ? '#6366f1' : 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)', opacity: bookmarking ? 0.6 : 1 }}>
            <Bookmark size={13} fill={bookmarked ? '#fff' : 'none'} />
          </button>
          {gallery.require_password && <div className="absolute top-3 right-3 p-1.5 rounded-full" style={{ background: 'var(--surface)' }}><Lock size={11} style={{ color: 'var(--text-muted)' }} /></div>}
          <div ref={mobileMenuRef} className="absolute top-3" style={{ right: gallery.require_password ? 40 : 12 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => { setMenuOpen(v => !v); setConfirmDelete(false) }} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: menuOpen ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)', color: '#fff', border: 'none', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-30" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 170 }}>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); setMoveModalOpen(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left" style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><FolderInput size={13} />Move to Folder</button>
                <button onClick={handleCopyLink} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left" style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Link size={13} />Copy Link</button>
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(true) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left" style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-subtle)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Trash2 size={13} />Delete</button>
              </div>
            )}
          </div>
        </div>
        <div className="p-4">
          {confirmDelete ? (
            <div onClick={e => e.stopPropagation()} className="space-y-2">
              <p className="text-xs leading-snug" style={{ color: 'var(--text)' }}>Delete <span className="font-semibold">"{gallery.title}"</span>? This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting…' : 'Delete'}</button>
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} disabled={deleting} className="flex-1 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="font-medium text-sm truncate mb-0.5" style={{ color: 'var(--text)' }}>{gallery.title}</h3>
              {gallery.client_name && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{gallery.client_name}</p>}
              {metaLine && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{metaLine}</p>}
              {!metaLine && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDate(gallery.created_at)}</p>}
              {gallery.expires_at && !isExpired && <span className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--warning)' }}><Clock size={11} />Expires {formatDate(gallery.expires_at)}</span>}
            </>
          )}
        </div>
      </div>

      <MoveFolderModal
        open={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        gallery={gallery}
        onMoved={onGalleryMoved}
      />
    </>
  )
}
