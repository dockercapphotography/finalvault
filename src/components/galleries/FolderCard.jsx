import { useState, useRef, useEffect } from 'react'
import { Folder, MoreVertical, Pencil, Trash2, ChevronRight } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { renameFolder, deleteFolderTree, getFolderTreeCounts } from '../../utils/galleryApi.js'

// 2x2 thumbnail grid — shows up to 4 gallery covers inside the folder
function CoverGrid({ coverUrls }) {
  const covers = coverUrls.slice(0, 4)

  if (covers.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <Folder size={32} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
      </div>
    )
  }

  // Pad to 4 slots with nulls for empty cells
  const cells = [...covers, null, null, null, null].slice(0, 4)

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5">
      {cells.map((url, i) => (
        <div
          key={i}
          className="overflow-hidden"
          style={{
            background: 'var(--surface)',
            borderRadius: i === 0 ? '6px 0 0 0' : i === 1 ? '0 6px 0 0' : i === 2 ? '0 0 0 6px' : '0 0 6px 0',
          }}
        >
          {url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'var(--surface-raised)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function FolderCard({ folder, coverUrls = [], galleryCount = 0, subfolderCount = 0, onNavigate, onRenamed, onDeleted }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameName, setRenameName] = useState(folder.name)
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [deleteCounts, setDeleteCounts] = useState(null) // { subfolderCount, galleryCount }
  const menuRef = useRef(null)
  const renameInputRef = useRef(null)

  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  })

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (renaming) { renameInputRef.current?.focus(); renameInputRef.current?.select() }
  }, [renaming])

  async function handleRename() {
    const trimmed = renameName.trim()
    if (!trimmed || trimmed === folder.name) { setRenaming(false); return }
    setRenameLoading(true)
    try {
      const updated = await renameFolder(folder.id, trimmed)
      onRenamed?.(updated)
      setRenaming(false)
    } catch (err) { console.error('Failed to rename folder:', err) }
    finally { setRenameLoading(false) }
  }

  async function handleDeleteConfirm() {
    // Load counts before showing confirm dialog
    setDeleteLoading(true)
    const counts = await getFolderTreeCounts(folder.id)
    setDeleteCounts(counts)
    setDeleteLoading(false)
    setDeleteConfirm(true)
    setDeleteError(null)
  }

  async function handleDelete() {
    setDeleteLoading(true)
    setDeleteError(null)
    const result = await deleteFolderTree(folder.id)
    if (!result.ok) { setDeleteError(result.error); setDeleteLoading(false); return }
    onDeleted?.(folder.id)
  }

  const countLine = [
    subfolderCount > 0 && `${subfolderCount} ${subfolderCount === 1 ? 'folder' : 'folders'}`,
    galleryCount > 0   && `${galleryCount} ${galleryCount === 1 ? 'gallery' : 'galleries'}`,
  ].filter(Boolean).join(' · ') || 'Empty'

  return (
    <div
      ref={setNodeRef}
      className="rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
      style={{
        background: 'var(--surface)',
        border: isOver ? '2px solid #6366f1' : '1px solid var(--border)',
        boxShadow: isOver ? '0 0 0 4px rgba(99,102,241,0.15)' : undefined,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onClick={() => !menuOpen && !renaming && !deleteConfirm && onNavigate?.(folder)}
      onMouseEnter={e => { if (!isOver) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { if (!isOver) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {/* Cover area */}
      <div
        className="aspect-[4/3] relative overflow-hidden"
        style={{ background: 'var(--surface-raised)' }}
      >
        <CoverGrid coverUrls={coverUrls} />

        {/* Folder icon overlay — bottom left */}
        <div
          className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
        >
          <Folder size={11} style={{ color: '#fff' }} />
          <span className="text-xs font-medium" style={{ color: '#fff' }}>Folder</span>
        </div>

        {/* Drop overlay */}
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.12)', zIndex: 10 }}>
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: '#6366f1', color: '#fff' }}>
              Drop to move here
            </div>
          </div>
        )}

        {/* ⋮ menu */}
        <div ref={menuRef} className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(v => !v)}
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
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160 }}
            >
              <button
                onClick={() => { setMenuOpen(false); setRenaming(true); setRenameName(folder.name) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Pencil size={13} />Rename
              </button>
              <button
                onClick={() => { setMenuOpen(false); handleDeleteConfirm() }}
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
      <div className="px-4 py-3">
        {renaming ? (
          <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={e => setRenameName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setRenameName(folder.name) } }}
              onBlur={handleRename}
              disabled={renameLoading}
              className="flex-1 text-sm font-medium rounded-lg px-2 py-1 outline-none"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
            />
          </div>
        ) : deleteConfirm ? (
          <div onClick={e => e.stopPropagation()} className="space-y-2">
            {deleteError ? (
              <p className="text-xs leading-snug" style={{ color: 'var(--danger)' }}>{deleteError}</p>
            ) : deleteLoading ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking contents…</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--danger)' }}>
                  Delete "{folder.name}"?
                </p>
                {deleteCounts && (deleteCounts.subfolderCount > 0 || deleteCounts.galleryCount > 0) ? (
                  <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                    This will permanently delete{' '}
                    {deleteCounts.subfolderCount > 0 && `${deleteCounts.subfolderCount} subfolder${deleteCounts.subfolderCount !== 1 ? 's' : ''}`}
                    {deleteCounts.subfolderCount > 0 && deleteCounts.galleryCount > 0 && ' and '}
                    {deleteCounts.galleryCount > 0 && `${deleteCounts.galleryCount} galler${deleteCounts.galleryCount !== 1 ? 'ies' : 'y'}`}
                    . This cannot be undone.
                  </p>
                ) : (
                  <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              {!deleteError && !deleteLoading && (
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Delete
                </button>
              )}
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteError(null); setDeleteCounts(null) }}
                disabled={deleteLoading}
                className="flex-1 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{folder.name}</h3>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{countLine}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Created {new Date(folder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        )}
      </div>
    </div>
  )
}
