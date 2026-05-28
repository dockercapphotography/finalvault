import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Settings, BarChart2, Copy, ExternalLink, Upload, ImageIcon, MoreVertical, Mail, Link as LinkIcon, QrCode, X, Plus, Pencil, Trash2, ChevronRight, Droplets } from 'lucide-react'
import { getGallery, updateGallery } from '../utils/galleryApi.js'
import { getImages, deleteImage, saveImageOrder } from '../utils/imageApi.js'
import { deleteFromR2 } from '../utils/r2.js'
import { supabase } from '../supabaseClient.js'
import { useImageUpload } from '../hooks/useImageUpload.js'
import { usePreviewUrls } from '../hooks/usePreviewUrls.js'
import { usePageDrop } from '../hooks/usePageDrop.js'
import ImageUploader from '../components/images/ImageUploader.jsx'
import ImageGrid from '../components/images/ImageGrid.jsx'
import UploadProgress from '../components/images/UploadProgress.jsx'
import BulkActionBar from '../components/images/BulkActionBar.jsx'
import SortDropdown, { sortImages } from '../components/images/SortDropdown.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatDate } from '../utils/formatters.js'
import CoverPickerModal from '../components/galleries/CoverPickerModal.jsx'
import ShareButton from '../components/galleries/ShareButton.jsx'
import { getActiveWatermark, getWatermarkUrl, getWatermarks } from '../utils/watermarkApi.js'
import { getSets, createSet, updateSet, deleteSet, saveSetOrder, moveImageToSet, moveImagesToSet } from '../utils/gallerySetApi.js'

export default function GalleryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [photographerId, setPhotographerId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sortBy, setSortBy] = useState('custom')
  const [savingOrder, setSavingOrder] = useState(false)
  const [coverId, setCoverId] = useState(null)
  const [activeWatermark, setActiveWatermark] = useState(null)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [sets, setSets] = useState([])
  const [activeSetId, setActiveSetId] = useState(null)
  const [showAddSet, setShowAddSet] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [editingSet, setEditingSet] = useState(null)
  const [editSetName, setEditSetName] = useState('')
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState(null)
  const [dragSetId, setDragSetId] = useState(null)
  const [dragOverSetId, setDragOverSetId] = useState(null)
  const [showReWatermark, setShowReWatermark] = useState(false)
  const [reWatermarkTarget, setReWatermarkTarget] = useState(null) // null = all in set, image = single
  const [watermarks, setWatermarks] = useState([])
  const [selectedWatermarkId, setSelectedWatermarkId] = useState(null)
  const [reWatermarking, setReWatermarking] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)

  function openSheet() { setShowActionSheet(true); requestAnimationFrame(() => requestAnimationFrame(() => setSheetVisible(true))) }
  function closeSheet() { setSheetVisible(false); setTimeout(() => setShowActionSheet(false), 300) }
  const [shareModal, setShareModal] = useState(null)

  const activeSetImages = activeSetId ? images.filter(i => i.set_id === activeSetId) : images
  const hasImages = images.length > 0
  const hasSetImages = activeSetImages.length > 0
  const { previewUrls, setPreviewUrls } = usePreviewUrls(images)

  const { uploadFiles, uploadItems, isUploading, reset: resetUpload } = useImageUpload({
    galleryId: id,
    photographerId,
    watermark: activeWatermark,
    setId: activeSetId,
    onComplete: async () => {
      const fresh = await getImages(id)
      setImages(fresh)
      resetUpload()
    },
  })

  const isDragOver = usePageDrop(uploadFiles, hasImages)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setPhotographerId(user?.id))
    load()
    loadWatermark()
    loadWatermarks()
  }, [id])

  async function loadWatermarks() {
    try {
      const wms = await getWatermarks()
      setWatermarks(wms)
    } catch (err) {
      console.warn('Could not load watermarks:', err)
    }
  }

  async function loadWatermark() {
    try {
      const wm = await getActiveWatermark()
      if (wm) {
        const { data: { session } } = await supabase.auth.getSession()
        const url = `${import.meta.env.VITE_R2_WORKER_URL}/watermark/${encodeURIComponent(wm.r2_key)}?token=${session.access_token}`
        setActiveWatermark({ url, opacity: wm.opacity, position: wm.position, scale: wm.scale ?? 0.15 })
      }
    } catch (err) {
      console.warn('Could not load watermark:', err)
    }
  }

  async function load() {
    try {
      setLoading(true)
      const [g, imgs, setsData] = await Promise.all([getGallery(id), getImages(id), getSets(id)])
      setGallery(g)
      setImages(imgs)
      setCoverId(g.cover_image_id || null)
      setSets(setsData)
      if (setsData.length > 0 && !activeSetId) setActiveSetId(setsData[0].id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSetDragStart(e, setId) {
    setDragSetId(setId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSetDragOver(e, setId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSetId(setId)
  }

  async function handleSetDrop(e, targetSetId) {
    e.preventDefault()
    if (!dragSetId || dragSetId === targetSetId) { setDragSetId(null); setDragOverSetId(null); return }
    const newOrder = [...sets]
    const fromIdx = newOrder.findIndex(s => s.id === dragSetId)
    const toIdx = newOrder.findIndex(s => s.id === targetSetId)
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setSets(newOrder)
    setDragSetId(null)
    setDragOverSetId(null)
    try { await saveSetOrder(newOrder.map(s => s.id)) } catch { /* silent */ }
  }

  async function handleAddSet() {
    if (!newSetName.trim()) return
    try {
      const s = await createSet(id, newSetName.trim())
      setSets(prev => [...prev, s])
      setActiveSetId(s.id)
      setNewSetName('')
      setShowAddSet(false)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleUpdateSet(setId) {
    if (!editSetName.trim()) return
    try {
      const updated = await updateSet(setId, { name: editSetName.trim() })
      setSets(prev => prev.map(s => s.id === setId ? updated : s))
      setEditingSet(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteSet(setId) {
    try {
      await deleteSet(setId)
      setSets(prev => {
        const next = prev.filter(s => s.id !== setId)
        if (activeSetId === setId && next.length > 0) setActiveSetId(next[0].id)
        return next
      })
      setConfirmDeleteSetId(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleMoveImage(imageId, targetSetId) {
    try {
      await moveImageToSet(imageId, targetSetId)
      setImages(prev => prev.map(i => i.id === imageId ? { ...i, set_id: targetSetId } : i))
      setToast({ message: 'Image moved', type: 'success' })
    } catch {
      setToast({ message: 'Failed to move image', type: 'error' })
    }
  }

  async function handleMoveSelected(targetSetId) {
    const toMove = [...selectedIds]
    try {
      await moveImagesToSet(toMove, targetSetId)
      setImages(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, set_id: targetSetId } : i))
      setSelectedIds(new Set())
      setToast({ message: `${toMove.length} images moved`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to move images', type: 'error' })
    }
  }

  async function handleDownloadImage(image, hires) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const workerUrl = import.meta.env.VITE_R2_WORKER_URL
    try {
      const url = hires
        ? `${workerUrl}/original/${encodeURIComponent(image.original_r2_key)}`
        : `${workerUrl}/preview/${encodeURIComponent(image.preview_r2_key)}`
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(hires ? { 'X-Hires': 'true' } : {}),
        }
      })
      if (!resp.ok) throw new Error('Download failed')
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = hires ? image.file_name : image.file_name.replace(/\.[^.]+$/, '_web.jpg')
      document.body.appendChild(link); link.click()
      document.body.removeChild(link); URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setToast({ message: 'Download failed: ' + err.message, type: 'error' })
    }
  }

  function handleOpenReWatermark(image = null) {
    setReWatermarkTarget(image)
    setSelectedWatermarkId(watermarks[0]?.id || null)
    setShowReWatermark(true)
  }

  async function handleReWatermark() {
    const wm = watermarks.find(w => w.id === selectedWatermarkId)
    if (!wm) return
    setReWatermarking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const workerUrl = import.meta.env.VITE_R2_WORKER_URL
      const token = session.access_token
      // Fetch watermark as blob since Image() can't send auth headers
      const wmResp = await fetch(`${workerUrl}/watermark/${encodeURIComponent(wm.r2_key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!wmResp.ok) { setToast({ message: 'Failed to load watermark', type: 'error' }); setReWatermarking(false); return }
      const wmBlobUrl = URL.createObjectURL(await wmResp.blob())
      const wmObj = { url: wmBlobUrl, opacity: wm.opacity, position: wm.position, scale: wm.scale ?? 0.15 }

      const targets = reWatermarkTarget
        ? [reWatermarkTarget]
        : images.filter(i => i.set_id === activeSetId)

      for (const img of targets) {
        // Fetch original
        const origResp = await fetch(`${workerUrl}/original/${encodeURIComponent(img.original_r2_key)}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Hires': 'true' }
        })
        if (!origResp.ok) continue
        const origBlob = await origResp.blob()
        const origUrl = URL.createObjectURL(origBlob)

        // Apply watermark via canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const original = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = origUrl })
        const scale = 2400 / Math.max(original.width, original.height)
        canvas.width = Math.round(original.width * scale)
        canvas.height = Math.round(original.height * scale)
        ctx.drawImage(original, 0, 0, canvas.width, canvas.height)

        // Load watermark
        const wmImg = await new Promise((res, rej) => {
          const i = new Image(); i.crossOrigin = 'anonymous'
          i.onload = () => res(i)
          i.onerror = (err) => rej(err)
          i.src = wmObj.url
        })
        const wmScale = wmObj.scale || 0.15
        const wmW = canvas.width * wmScale
        const wmH = (wmImg.height / wmImg.width) * wmW
        const positions = {
          'center':       [(canvas.width - wmW) / 2, (canvas.height - wmH) / 2],
          'top-left':     [canvas.width * 0.02, canvas.height * 0.02],
          'top-right':    [canvas.width * 0.98 - wmW, canvas.height * 0.02],
          'bottom-left':  [canvas.width * 0.02, canvas.height * 0.98 - wmH],
          'bottom-right': [canvas.width * 0.98 - wmW, canvas.height * 0.98 - wmH],
        }
        const [wx, wy] = positions[wmObj.position] || positions['bottom-right']
        ctx.globalAlpha = wmObj.opacity > 1 ? wmObj.opacity / 100 : wmObj.opacity
        ctx.drawImage(wmImg, wx, wy, wmW, wmH)
        ctx.globalAlpha = 1
        URL.revokeObjectURL(origUrl)

        // Upload new preview
        const previewBlob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.88))
        const formData = new FormData()
        formData.append('file', previewBlob, 'preview.webp')
        formData.append('key', img.preview_r2_key)
        const uploadResp = await fetch(`${workerUrl}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })

        // Directly inject the new preview from the canvas blob — no need to re-fetch
        if (uploadResp.status === 200) {
          const newBlobUrl = URL.createObjectURL(previewBlob)
          setPreviewUrls(prev => {
            if (prev[img.id]?.startsWith('blob:')) URL.revokeObjectURL(prev[img.id])
            return { ...prev, [img.id]: newBlobUrl }
          })
        }
      }

      URL.revokeObjectURL(wmBlobUrl)
      setShowReWatermark(false)
      setToast({ message: `Watermark applied to ${targets.length} image${targets.length !== 1 ? 's' : ''}`, type: 'success' })
    } catch (err) {
      setToast({ message: 'Re-watermark failed: ' + err.message, type: 'error' })
    } finally {
      setReWatermarking(false)
    }
  }

  async function handleSortChange(newSort) {
    setSortBy(newSort)
    const sorted = sortImages(images, newSort)
    setImages(sorted)
    setSavingOrder(true)
    try {
      await saveImageOrder(sorted.map(i => i.id))
      setToast({ message: 'Image order saved', type: 'success' })
    } catch {
      setToast({ message: 'Failed to save order', type: 'error' })
    } finally {
      setSavingOrder(false)
    }
  }

  async function handleSetCover(image, focusX = 0.5, focusY = 0.5, focusOnly = false) {
    try {
      if (focusOnly) {
        await updateGallery(id, { cover_focus_x: focusX, cover_focus_y: focusY })
      } else {
        await updateGallery(id, { cover_image_id: image.id, cover_r2_key: null, cover_focus_x: focusX, cover_focus_y: focusY })
        setCoverId(image.id)
      }
      // Keep local gallery state in sync so the modal re-opens with the correct focal point
      setGallery(prev => ({
        ...prev,
        cover_focus_x: focusX,
        cover_focus_y: focusY,
        ...(focusOnly ? {} : { cover_image_id: image.id, cover_r2_key: null }),
      }))
      setToast({ message: 'Cover updated', type: 'success' })
    } catch {
      setToast({ message: 'Failed to set cover', type: 'error' })
    }
  }

  async function handleCoverUpload(file, focusX = 0.5, focusY = 0.5) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const ext = file.name.split('.').pop().toLowerCase()
      const key = `photographers/${photographerId}/galleries/${id}/preview/cover-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', key)
      const resp = await fetch(`${import.meta.env.VITE_R2_WORKER_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      if (!resp.ok) throw new Error('Upload failed')
      await updateGallery(id, { cover_r2_key: key, cover_image_id: null, cover_focus_x: focusX, cover_focus_y: focusY })
      setCoverId(null)
      // Keep local gallery state in sync so the modal re-opens with the correct focal point
      setGallery(prev => ({
        ...prev,
        cover_r2_key: key,
        cover_image_id: null,
        cover_focus_x: focusX,
        cover_focus_y: focusY,
      }))
      setToast({ message: 'Cover image uploaded', type: 'success' })
    } catch {
      setToast({ message: 'Failed to upload cover', type: 'error' })
    }
  }

  function handleSelect(imageId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(imageId) ? next.delete(imageId) : next.add(imageId)
      return next
    })
  }

  function handleSelectAll() { setSelectedIds(new Set(images.map(i => i.id))) }
  function handleClearSelection() { setSelectedIds(new Set()) }

  async function handleDeleteSelected() {
    const toDelete = [...selectedIds]
    const { data: { session } } = await supabase.auth.getSession()
    let errors = 0
    await Promise.all(toDelete.map(async (imageId) => {
      const image = images.find(i => i.id === imageId)
      if (!image) return
      try {
        await deleteFromR2({ key: image.original_r2_key, token: session.access_token })
        await deleteImage(imageId)
      } catch { errors++ }
    }))
    setImages(prev => prev.filter(i => !selectedIds.has(i.id)))
    setSelectedIds(new Set())
    setToast({
      message: errors > 0 ? `Deleted with ${errors} error(s)` : `${toDelete.length} images deleted`,
      type: errors > 0 ? 'error' : 'success'
    })
  }

  async function handleDeleteImage(imageId) {
    const image = images.find(i => i.id === imageId)
    if (!image) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await deleteFromR2({ key: image.original_r2_key, token: session.access_token })
      await deleteImage(imageId)
      setImages(prev => prev.filter(i => i.id !== imageId))
      setToast({ message: 'Image deleted', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error) return (
    <div className="px-4 py-3 rounded-xl text-sm"
      style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
      {error}
    </div>
  )

  if (!gallery) return null

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive' : isExpired ? 'expired' : 'active'
  const statusBadge = {
    active:   <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired:  <Badge variant="danger">Expired</Badge>,
  }

  return (
    <>
      {isDragOver && hasImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}>
          <div className="flex flex-col items-center justify-center w-72 h-48 rounded-2xl"
            style={{ background: 'var(--surface)', border: '2px dashed var(--accent)' }}>
            <Upload size={28} className="mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-semibold text-lg mb-1" style={{ color: 'var(--text)' }}>Drop to upload</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Release to add to this gallery</p>
          </div>
        </div>
      )}

      <div className="max-w-5xl space-y-6">
        {/* ── Mobile top bar ── */}
        <div className="flex items-center gap-2 md:hidden -mx-0 mb-2">
          <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
          {statusBadge[status]}
          <button onClick={openSheet} style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <MoreVertical size={18} />
          </button>
        </div>

        {/* ── Desktop header ── */}
        <div className="hidden md:block">
          <Button variant="ghost" onClick={() => navigate('/')} className="-ml-2">
            <ArrowLeft size={15} />Back to galleries
          </Button>
        </div>

        <div className="hidden md:block">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
                {statusBadge[status]}
              </div>
              {/* Line 1: client name · event name */}
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {[gallery.client_name, gallery.event_name].filter(Boolean).join(' · ')}
              </p>
              {/* Line 2: dates */}
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {[
                  gallery.event_date && `Event ${formatDate(gallery.event_date)}`,
                  `Created ${formatDate(gallery.created_at)}`,
                  gallery.expires_at && `Expires ${formatDate(gallery.expires_at)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <ShareButton gallery={gallery} />
              <Button variant="secondary" onClick={() => setShowCoverPicker(true)}>
                <ImageIcon size={14} />Cover Image
              </Button>
              <Button variant="secondary" onClick={() => window.open(`/g/${gallery.share_token}`, '_blank')}>
                <ExternalLink size={14} />Preview
              </Button>
              <Link to={`/galleries/${id}/activity`}>
                <Button variant="secondary"><BarChart2 size={14} />Activity</Button>
              </Link>
              <Link to={`/galleries/${id}/settings`}>
                <Button variant="secondary"><Settings size={14} />Settings</Button>
              </Link>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ── Set tabs ── */}
        {sets.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-1 flex-wrap">
              {sets.map(set => (
                <div key={set.id} className="relative group/settab"
                  onDragOver={e => handleSetDragOver(e, set.id)}
                  onDrop={e => handleSetDrop(e, set.id)}
                  style={{ opacity: dragSetId === set.id ? 0.4 : 1, outline: dragOverSetId === set.id && dragSetId !== set.id ? '2px solid #6366f1' : 'none', borderRadius: 8 }}>
                  {editingSet === set.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editSetName}
                        onChange={e => setEditSetName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateSet(set.id); if (e.key === 'Escape') setEditingSet(null) }}
                        onBlur={() => handleUpdateSet(set.id)}
                        className="text-sm px-2 py-1 rounded-lg"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text)', outline: 'none', minWidth: 80 }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveSetId(set.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        background: activeSetId === set.id ? '#6366f1' : 'var(--surface)',
                        color: activeSetId === set.id ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${activeSetId === set.id ? '#6366f1' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}>
                      {set.name}
                      <span className="text-xs opacity-70">({images.filter(i => i.set_id === set.id).length})</span>
                    </button>
                  )}
                  {/* Set action buttons on hover */}
                  {editingSet !== set.id && (
                    <div className="absolute -top-1 -right-1 hidden group-hover/settab:flex items-center gap-0.5 z-10">
                      <div
                        draggable
                        onDragStart={e => handleSetDragStart(e, set.id)}
                        onDragOver={e => handleSetDragOver(e, set.id)}
                        onDrop={e => handleSetDrop(e, set.id)}
                        onDragEnd={() => { setDragSetId(null); setDragOverSetId(null) }}
                        className="w-4 h-4 rounded-full flex items-center justify-center cursor-grab"
                        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1 }}>⠿</span>
                      </div>
                      <button onClick={() => { setEditingSet(set.id); setEditSetName(set.name) }}
                        className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                        <Pencil size={8} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      {sets.length > 1 && (
                        <button onClick={() => setConfirmDeleteSetId(set.id)}
                          className="w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                          <Trash2 size={8} style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </div>
                  )}
                  {/* Delete confirm */}
                  {confirmDeleteSetId === set.id && (
                    <div className="absolute top-full left-0 mt-1 z-20 rounded-xl p-3 shadow-lg space-y-2"
                      style={{ background: 'var(--surface)', border: '1px solid var(--danger)', minWidth: 200 }}>
                      <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>Delete "{set.name}"? Images won't be deleted.</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleDeleteSet(set.id)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
                        <button onClick={() => setConfirmDeleteSetId(null)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add set */}
              {showAddSet ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSet(); if (e.key === 'Escape') { setShowAddSet(false); setNewSetName('') } }}
                    placeholder="Set name"
                    className="text-sm px-2 py-1 rounded-lg"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text)', outline: 'none', minWidth: 100 }}
                  />
                  <button onClick={handleAddSet}
                    className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => { setShowAddSet(false); setNewSetName('') }}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowAddSet(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                  <Plus size={11} />New Set
                </button>
              )}

              {/* Re-watermark set button */}
              {activeSetImages.length > 0 && (
                <button onClick={() => handleOpenReWatermark(null)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ml-auto"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Droplets size={11} />Re-watermark set
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Images for active set ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
              Images ({activeSetImages.length})
              {savingOrder && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Saving order...</span>}
            </h2>
            <div className="flex items-center gap-2">
              {hasSetImages && <SortDropdown value={sortBy} onChange={handleSortChange} />}
              {hasImages && <ImageUploader onUpload={uploadFiles} compact />}
            </div>
          </div>

          {uploadItems.length > 0 && <UploadProgress items={uploadItems} />}

          {hasSetImages && (
            <ImageGrid
              images={activeSetImages}
              previewUrls={previewUrls}
              onDelete={handleDeleteImage}
              coverId={coverId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              selectionMode={selectedIds.size > 0}
              sets={sets}
              onMoveToSet={handleMoveImage}
              onReWatermark={handleOpenReWatermark}
              onDownload={handleDownloadImage}
            />
          )}

          {!hasSetImages && !isUploading && activeSetId && (
            <ImageUploader onUpload={uploadFiles} />
          )}
        </div>

      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={activeSetImages.length}
          onClearSelection={handleClearSelection}
          onSelectAll={() => setSelectedIds(new Set(activeSetImages.map(i => i.id)))}
          onDeleteSelected={handleDeleteSelected}
          sets={sets.filter(s => s.id !== activeSetId)}
          onMoveToSet={handleMoveSelected}
          onDownloadSelected={async (hires) => {
            const selected = images.filter(i => selectedIds.has(i.id))
            const { data: { session } } = await supabase.auth.getSession()
            const token = session.access_token
            const workerUrl = import.meta.env.VITE_R2_WORKER_URL
            const keys = selected.map(i => hires ? i.original_r2_key : i.preview_r2_key)
            const names = selected.map(i => hires ? i.file_name : i.file_name.replace(/\.[^.]+$/, '_web.jpg'))
            const resp = await fetch(`${workerUrl}/download-zip`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ galleryId: id, imageKeys: keys, fileNames: names }),
            })
            if (!resp.ok) return
            const blob = await resp.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url
            a.download = `${gallery.title.replace(/[^a-z0-9]/gi, '_')}.zip`
            document.body.appendChild(a); a.click()
            document.body.removeChild(a); URL.revokeObjectURL(url)
            setSelectedIds(new Set())
          }}
        />
      )}

      {showCoverPicker && (
        <CoverPickerModal
          images={images}
          previewUrls={previewUrls}
          onSelect={handleSetCover}
          onUpload={handleCoverUpload}
          onClose={() => setShowCoverPicker(false)}
          existingCoverUrl={
            gallery.cover_r2_key
              ? `${import.meta.env.VITE_R2_WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}`
              : coverId && previewUrls[coverId]
                ? previewUrls[coverId]
                : null
          }
          existingFocusX={gallery.cover_focus_x ?? 0.5}
          existingFocusY={gallery.cover_focus_y ?? 0.5}
        />
      )}

      {/* ── Re-watermark modal ── */}
      {showReWatermark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => !reWatermarking && setShowReWatermark(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Re-watermark</h3>
              <button onClick={() => setShowReWatermark(false)} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div className="px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
              This will replace the current preview{reWatermarkTarget ? ' for this image' : ` for all ${activeSetImages.length} images in this set`}. It may take a moment.
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Select watermark</label>
              <select
                value={selectedWatermarkId || ''}
                onChange={e => setSelectedWatermarkId(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px',
                  outline: 'none', cursor: 'pointer', appearance: 'none',
                }}>
                {watermarks.map(wm => (
                  <option key={wm.id} value={wm.id}>{wm.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleReWatermark} disabled={!selectedWatermarkId || reWatermarking}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', opacity: reWatermarking ? 0.6 : 1, cursor: reWatermarking ? 'not-allowed' : 'pointer' }}>
                {reWatermarking ? 'Processing...' : 'Apply Watermark'}
              </button>
              <button onClick={() => setShowReWatermark(false)} disabled={reWatermarking}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}

      {/* ── Mobile action sheet ── */}
      {showActionSheet && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden"
          style={{ background: sheetVisible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)', transition: 'background 0.3s ease' }}
          onClick={closeSheet}>
          <div className="w-full rounded-t-2xl p-4 space-y-3"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
            onClick={e => e.stopPropagation()}>
            <div className="w-8 h-1 rounded-full mx-auto mb-2" style={{ background: 'var(--border-strong)' }} />

            {/* Gallery info strip */}
            <div className="px-1 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
                {statusBadge[status]}
              </div>
              {/* Line 1: client name · event name */}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {[gallery.client_name, gallery.event_name].filter(Boolean).join(' · ')}
              </p>
              {/* Line 2: dates */}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {[
                  gallery.event_date && `Event ${formatDate(gallery.event_date)}`,
                  `Created ${formatDate(gallery.created_at)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Mail, label: 'Email', action: () => { closeSheet(); setTimeout(() => setShareModal('email'), 300) } },
                { icon: LinkIcon, label: 'Get Link', action: () => { closeSheet(); setTimeout(() => setShareModal('link'), 300) } },
                { icon: QrCode, label: 'QR Code', action: () => { closeSheet(); setTimeout(() => setShareModal('qr'), 300) } },
                { icon: ImageIcon, label: 'Cover', action: () => { closeSheet(); setTimeout(() => setShowCoverPicker(true), 300) } },
                { icon: ExternalLink, label: 'Preview', action: () => { closeSheet(); window.open(`/g/${gallery.share_token}`, '_blank') } },
                { icon: BarChart2, label: 'Activity', action: () => { closeSheet(); setTimeout(() => navigate(`/galleries/${id}/activity`), 300) } },
                { icon: Settings, label: 'Settings', action: () => { closeSheet(); setTimeout(() => navigate(`/galleries/${id}/settings`), 300) } },
              ].map(({ icon: Icon, label, action }) => (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Icon size={22} style={{ color: 'var(--text)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Share modals triggered from mobile sheet */}
      {shareModal && (
        <ShareButton gallery={gallery} openModal={shareModal} onModalClose={() => setShareModal(null)} mobileOnly />
      )}
    </>
  )
}
