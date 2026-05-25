import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Settings, BarChart2, Copy, ExternalLink,
  Trash2, Upload, Images, CheckCircle
} from 'lucide-react'
import { getGallery, deleteGallery } from '../utils/galleryApi.js'
import { getImages } from '../utils/imageApi.js'
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

  useEffect(() => { load() }, [id])

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

  function handleCopyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/g/${gallery.share_token}`)
    setToast({ message: 'Gallery link copied!', type: 'success' })
  }

  async function handleDelete() {
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
      {/* Back */}
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
            {gallery.expires_at && ` · Expires ${formatDate(gallery.expires_at)}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={handleCopyLink}>
            <Copy size={14} />
            Copy Link
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.open(`/g/${gallery.share_token}`, '_blank')}
          >
            <ExternalLink size={14} />
            Preview
          </Button>
          <Link to={`/galleries/${id}/activity`}>
            <Button variant="secondary">
              <BarChart2 size={14} />
              Activity
            </Button>
          </Link>
          <Link to={`/galleries/${id}/settings`}>
            <Button variant="secondary">
              <Settings size={14} />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Images section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
            Images ({images.length})
          </h2>
          <Button>
            <Upload size={14} />
            Upload Images
          </Button>
        </div>

        {images.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
            style={{ border: '2px dashed var(--border)', background: 'var(--bg-subtle)' }}
          >
            <Images size={28} className="mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium text-sm mb-1" style={{ color: 'var(--text)' }}>No images yet</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Upload images to add them to this gallery
            </p>
            <Button>
              <Upload size={14} />
              Upload Images
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {images.map(image => (
              <div key={image.id}
                className="aspect-square rounded-lg overflow-hidden"
                style={{ background: 'var(--surface-raised)' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Danger zone */}
      <div className="space-y-3">
        <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Danger Zone</h2>
        {!confirmDelete ? (
          <div
            className="flex items-center justify-between p-4 rounded-xl"
            style={{ border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete this gallery</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Permanently deletes the gallery and all its images. This cannot be undone.
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        ) : (
          <div
            className="p-4 rounded-xl space-y-3"
            style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
              Are you sure? This will permanently delete &ldquo;{gallery.title}&rdquo; and all its images.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} />
                {deleting ? 'Deleting...' : 'Yes, delete permanently'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
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
