import { useState, useRef, useEffect } from 'react'
import { Folder, MoreVertical, Pencil, Trash2, Image as ImageIcon, X, Upload } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { renameFolder, deleteFolderTree, getFolderTreeCounts, updateFolderCover, getFolderImages } from '../../utils/galleryApi.js'
import { supabase } from '../../supabaseClient.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}

function CoverGrid({ coverUrls, folderCoverUrl, focusX = 0.5, focusY = 0.5 }) {
  if (folderCoverUrl) {
    return (
      <img
        src={folderCoverUrl}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${focusX * 100}% ${focusY * 100}%`,
          display: 'block',
        }}
      />
    )
  }

  const covers = coverUrls.slice(0, 4)

  if (covers.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <Folder size={32} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
      </div>
    )
  }

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

// Full cover picker with focal point — mirrors CoverPickerModal for galleries
function FolderCoverPickerModal({ folder, onSaved, onClose }) {
  const [stage, setStage] = useState('pick') // 'pick' | 'focal'
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewUrls, setPreviewUrls] = useState({})
  const [chosen, setChosen] = useState(null) // { type: 'gallery'|'upload', url, r2Key, file? }
  const [focusX, setFocusX] = useState(folder.cover_focus_x ?? 0.5)
  const [focusY, setFocusY] = useState(folder.cover_focus_y ?? 0.5)
  const [saving, setSaving] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const fileInputRef = useRef(null)
  const focalRef = useRef(null)
  const isDragging = useRef(false)
  const ownedBlobsRef = useRef([])

  useEffect(() => {
    async function load() {
      try {
        const imgs = await getFolderImages(folder.id)
        setImages(imgs)
        const urls = {}
        await Promise.all(imgs.slice(0, 12).map(async img => {
          try {
            const url = await fetchAuthedBlob(img.preview_r2_key)
            ownedBlobsRef.current.push(url)
            urls[img.id] = url
          } catch {}
        }))
        setPreviewUrls(urls)
      } finally {
        setLoading(false)
      }
    }
    // If existing cover, go straight to focal stage
    if (folder.cover_r2_key) {
      setLoadingPreview(true)
      fetchAuthedBlob(folder.cover_r2_key)
        .then(url => {
          ownedBlobsRef.current.push(url)
          setChosen({ type: 'existing', url, r2Key: folder.cover_r2_key })
          setStage('focal')
        })
        .catch(() => {})
        .finally(() => setLoadingPreview(false))
    }
    load()
    return () => { ownedBlobsRef.current.forEach(u => URL.revokeObjectURL(u)) }
  }, [folder.id])

  async function handlePickGallery(img) {
    setLoadingPreview(true)
    setFocusX(0.5)
    setFocusY(0.5)
    try {
      const url = await fetchAuthedBlob(img.preview_r2_key)
      ownedBlobsRef.current.push(url)
      setChosen({ type: 'gallery', url, r2Key: img.preview_r2_key })
      setStage('focal')
    } catch (err) {
      console.error('Failed to load cover preview:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  function handleBrowse(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    ownedBlobsRef.current.push(url)
    setChosen({ type: 'upload', url, file })
    setFocusX(0.5)
    setFocusY(0.5)
    setStage('focal')
    e.target.value = ''
  }

  function updateFocal(e) {
    e.preventDefault()
    const rect = focalRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    setFocusX(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
    setFocusY(Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)))
  }

  function handlePointerDown(e) {
    e.preventDefault()
    isDragging.current = true
    focalRef.current?.setPointerCapture(e.pointerId)
    updateFocal(e)
  }

  function handlePointerMove(e) {
    if (!isDragging.current) return
    e.preventDefault()
    updateFocal(e)
  }

  function handlePointerUp() { isDragging.current = false }

  async function handleSave() {
    if (!chosen) return
    setSaving(true)
    try {
      let r2Key = chosen.r2Key

      // If uploading a new file, upload it to R2 first
      if (chosen.type === 'upload' && chosen.file) {
        const { data: { session } } = await supabase.auth.getSession()
        const ext = chosen.file.name.split('.').pop().toLowerCase()
        r2Key = `photographers/${folder.photographer_id}/folders/${folder.id}/cover.${ext}`
        const formData = new FormData()
        formData.append('file', chosen.file)
        formData.append('key', r2Key)
        const resp = await fetch(`${WORKER_URL}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        })
        if (!resp.ok) throw new Error('Upload failed')
      }

      await updateFolderCover(folder.id, r2Key, focusX, focusY)
      onSaved(r2Key, focusX, focusY)
      ownedBlobsRef.current.forEach(u => URL.revokeObjectURL(u))
      onClose()
    } catch (err) {
      console.error('Failed to set folder cover:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveCover() {
    setSaving(true)
    try {
      await updateFolderCover(folder.id, null, 0.5, 0.5)
      onSaved(null, 0.5, 0.5)
      onClose()
    } catch (err) {
      console.error('Failed to remove folder cover:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--surface)', maxWidth: 640, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
            {stage === 'pick' ? 'Change Folder Cover' : 'Adjust Focus Point'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Loading existing cover */}
        {stage === 'focal' && !chosen && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Pick stage */}
        {stage === 'pick' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 gap-3 transition-colors"
              style={{ borderColor: 'var(--border)', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Upload size={24} style={{ color: 'var(--text-muted)' }} />
              <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>Drag photo here to upload</p>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
              >
                Browse files
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleBrowse} />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
              </div>
            ) : images.length > 0 ? (
              <div>
                <p className="text-xs font-medium mb-3 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Select from Gallery
                </p>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {images.map(img => (
                      <button
                        key={img.id}
                        onClick={() => handlePickGallery(img)}
                        className="aspect-square rounded-lg overflow-hidden"
                        style={{ background: 'var(--surface-raised)', cursor: 'pointer', padding: 0, border: '2px solid transparent' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        {previewUrls[img.id] ? (
                          <img src={previewUrls[img.id]} alt={img.file_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                              style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
                No images in this folder's galleries yet.
              </p>
            )}

            {folder.cover_r2_key && (
              <button
                onClick={handleRemoveCover}
                disabled={saving}
                className="w-full text-sm py-2 rounded-lg"
                style={{ color: 'var(--danger)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Remove custom cover
              </button>
            )}
          </div>
        )}

        {/* Focal point stage */}
        {stage === 'focal' && chosen && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Drag the circle to set the focal point — this part will always be visible in the folder card.
            </p>
            <div
              ref={focalRef}
              className="relative rounded-xl overflow-hidden"
              style={{ cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                src={chosen.url}
                alt="Cover preview"
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '55vh', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
                draggable={false}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${focusX * 100}%`,
                  top: `${focusY * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '3px solid white',
                  background: 'rgba(99,102,241,0.5)',
                  boxShadow: '0 0 0 1px #6366f1, 0 2px 8px rgba(0,0,0,0.5)',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setStage('pick'); setChosen(null) }}
                className="text-sm font-medium"
                style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                ← Change image
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer', border: 'none' }}
              >
                {saving ? 'Saving…' : 'Set Cover'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FolderCard({ folder, coverUrls = [], galleryCount = 0, subfolderCount = 0, onNavigate, onRenamed, onDeleted, onCoverChanged }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameName, setRenameName] = useState(folder.name)
  const [renameLoading, setRenameLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [deleteCounts, setDeleteCounts] = useState(null)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [folderCoverUrl, setFolderCoverUrl] = useState(null)
  const menuRef = useRef(null)
  const renameInputRef = useRef(null)

  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  })

  useEffect(() => {
    if (!folder.cover_r2_key) { setFolderCoverUrl(null); return }
    let cancelled = false
    fetchAuthedBlob(folder.cover_r2_key)
      .then(url => { if (!cancelled) setFolderCoverUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [folder.cover_r2_key])

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

  function handleCoverSaved(newKey, focusX, focusY) {
    onCoverChanged?.(folder.id, newKey, focusX, focusY)
  }

  const countLine = [
    subfolderCount > 0 && `${subfolderCount} ${subfolderCount === 1 ? 'folder' : 'folders'}`,
    galleryCount > 0   && `${galleryCount} ${galleryCount === 1 ? 'gallery' : 'galleries'}`,
  ].filter(Boolean).join(' · ') || 'Empty'

  return (
    <>
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
        <div className="aspect-[4/3] relative overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
          <CoverGrid
            coverUrls={coverUrls}
            folderCoverUrl={folderCoverUrl}
            focusX={folder.cover_focus_x ?? 0.5}
            focusY={folder.cover_focus_y ?? 0.5}
          />

          {/* Folder icon overlay */}
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
                  onClick={() => { setMenuOpen(false); setShowCoverPicker(true) }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ImageIcon size={13} />Set Cover
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
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
              ) : (
                <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                  {deleteCounts && (deleteCounts.subfolderCount > 0 || deleteCounts.galleryCount > 0)
                    ? `Delete "${folder.name}" and its ${[
                        deleteCounts.subfolderCount > 0 && `${deleteCounts.subfolderCount} ${deleteCounts.subfolderCount === 1 ? 'folder' : 'folders'}`,
                        deleteCounts.galleryCount > 0 && `${deleteCounts.galleryCount} ${deleteCounts.galleryCount === 1 ? 'gallery' : 'galleries'}`,
                      ].filter(Boolean).join(' and ')}?`
                    : `Delete "${folder.name}"?`}
                </p>
              )}
              {!deleteLoading && !deleteError && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDeleteConfirm(false); setDeleteCounts(null) }}
                    className="flex-1 text-xs py-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 text-xs py-1.5 rounded-lg"
                    style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >Delete</button>
                </div>
              )}
              {deleteError && (
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteError(null) }}
                  className="text-xs"
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                >Dismiss</button>
              )}
            </div>
          ) : (
            <>
              <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{folder.name}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{countLine}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                Created {new Date(folder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </>
          )}
        </div>
      </div>

      {showCoverPicker && (
        <FolderCoverPickerModal
          folder={folder}
          onSaved={handleCoverSaved}
          onClose={() => setShowCoverPicker(false)}
        />
      )}
    </>
  )
}
