import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Settings, BarChart2, Copy, ExternalLink, Upload, ImageIcon, MoreVertical, Mail, Link as LinkIcon, QrCode, X } from 'lucide-react'
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
import { getActiveWatermark, getWatermarkUrl } from '../utils/watermarkApi.js'

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
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)

  function openSheet() { setShowActionSheet(true); requestAnimationFrame(() => requestAnimationFrame(() => setSheetVisible(true))) }
  function closeSheet() { setSheetVisible(false); setTimeout(() => setShowActionSheet(false), 300) }
  const [shareModal, setShareModal] = useState(null)

  const hasImages = images.length > 0
  const previewUrls = usePreviewUrls(images)

  const { uploadFiles, uploadItems, isUploading, reset: resetUpload } = useImageUpload({
    galleryId: id,
    photographerId,
    watermark: activeWatermark,
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
  }, [id])

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
      const [g, imgs] = await Promise.all([getGallery(id), getImages(id)])
      setGallery(g)
      setImages(imgs)
      setCoverId(g.cover_image_id || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
              Images ({images.length})
              {savingOrder && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Saving order...</span>}
            </h2>
            <div className="flex items-center gap-2">
              {hasImages && <SortDropdown value={sortBy} onChange={handleSortChange} />}
              {hasImages && <ImageUploader onUpload={uploadFiles} compact />}
            </div>
          </div>

          {uploadItems.length > 0 && <UploadProgress items={uploadItems} />}

          {hasImages && (
            <ImageGrid
              images={images}
              previewUrls={previewUrls}
              onDelete={handleDeleteImage}
              coverId={coverId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              selectionMode={selectedIds.size > 0}
            />
          )}

          {!hasImages && !isUploading && <ImageUploader onUpload={uploadFiles} />}
        </div>

      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={images.length}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onDeleteSelected={handleDeleteSelected}
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
