import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Settings, BarChart2, Copy, ExternalLink,
  Trash2, Upload, Images
} from 'lucide-react'
import { getGallery, deleteGallery } from '../utils/galleryApi.js'
import { getImages, deleteImage } from '../utils/imageApi.js'
import { deleteFromR2 } from '../utils/r2.js'
import { supabase } from '../supabaseClient.js'
import { useImageUpload } from '../hooks/useImageUpload.js'
import { usePreviewUrls } from '../hooks/usePreviewUrls.js'
import ImageUploader from '../components/images/ImageUploader.jsx'
import ImageGrid from '../components/images/ImageGrid.jsx'
import UploadProgress from '../components/images/UploadProgress.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatDate } from '../utils/formatters.js'

export default function GalleryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [photographerId, setPhotographerId] = useState(null)

  const previewUrls = usePreviewUrls(images)

  const { uploadFiles, uploadItems, isUploading, reset: resetUpload } = useImageUpload({
    galleryId: id,
    photographerId,
    watermark: null, // TODO: load from photographer profile in Account step
    onComplete: () => loadImages(),
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setPhotographerId(user?.id))
    load()
  }, [id])

  async function load() {
    try {
      setLoading(true)
      const [g, imgs] = await Promise.all([getGallery(id), getImages(id)])
      setGallery(g)
      setImages(imgs)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadImages() {
    const imgs = await getImages(id)
    setImages(imgs)
    resetUpload()
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/g/${gallery.share_token}`)
    setToast({ message: 'Gallery link copied!', type: 'success' })
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

  async function handleDeleteGallery() {
    setDeleting(true)
    try {
      await deleteGallery(id)
      navigate('/')
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
      setDeleting(false)
      setConfirmDelete(false)
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
    <div className="max-w-5xl space-y-6">
      <Button variant="ghost" onClick={() => navigate('/')} className="-ml-2">
        <ArrowLeft size={15} />
        Back to galleries
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
            {statusBadge[status]}
          </div>
          {gallery.client_name && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{gallery.client_name}</p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Created {formatDate(gallery.created_at)}
            {gallery.event_date && ` · Event ${formatDate(gallery.event_date)}`}
            {gallery.expires_at && ` · Expires ${formatDate(gallery.expires_at)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleCopyLink}>
            <Copy size={14} />
            Copy Link
          </Button>
          <Button variant="secondary"
            onClick={() => window.open(`/g/${gallery.share_token}`, '_blank')}>
            <ExternalLink size={14} />
            Preview
          </Button>
          <Link to={`/galleries/${id}/activity`}>
            <Button variant="secondary"><BarChart2 size={14} />Activity</Button>
          </Link>
          <Link to={`/galleries/${id}/settings`}>
            <Button variant="secondary"><Settings size={14} />Settings</Button>
          </Link>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Images section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
            Images ({images.length})
          </h2>
        </div>

        {/* Upload progress */}
        {uploadItems.length > 0 && (
          <UploadProgress items={uploadItems} />
        )}

        {/* Image grid */}
        {images.length > 0 && !isUploading && (
          <ImageGrid
            images={images}
            previewUrls={previewUrls}
            onDelete={handleDeleteImage}
          />
        )}

        {/* Upload zone */}
        {!isUploading && (
          <ImageUploader
            onUpload={uploadFiles}
            disabled={isUploading}
          />
        )}

        {images.length === 0 && uploadItems.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            Drop images above or click to browse
          </p>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Danger zone */}
      <div className="space-y-3">
        <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Danger Zone</h2>
        {!confirmDelete ? (
          <div className="flex items-center justify-between p-4 rounded-xl"
            style={{ border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete this gallery</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Permanently deletes the gallery and all its images. Cannot be undone.
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />Delete
            </Button>
          </div>
        ) : (
          <div className="p-4 rounded-xl space-y-3"
            style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
              Are you sure? This will permanently delete &ldquo;{gallery.title}&rdquo; and all its images.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDeleteGallery} disabled={deleting}>
                <Trash2 size={14} />
                {deleting ? 'Deleting...' : 'Yes, delete permanently'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
