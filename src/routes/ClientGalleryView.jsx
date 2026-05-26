import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Heart, Download, X, ChevronLeft, ChevronRight, MessageCircle, Archive } from 'lucide-react'
import {
  getGalleryByToken, getClientImages, getViewerFromSession,
  getViewerFavorites, toggleFavorite, getComments, addComment,
  getPreviewUrl, downloadOriginal, downloadZip, verifyDownloadPin
} from '../utils/clientApi.js'

// ── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ images, index, onClose, onPrev, onNext, favorites, onToggleFavorite, allowDownloads, onDownload, token }) {
  const image = images[index]
  if (!image) return null

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onPrev, onNext])

  const isFav = favorites.has(image.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={onClose}>

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={e => e.stopPropagation()}>
        {allowDownloads && (
          <button onClick={() => onDownload(image)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
            <Download size={16} />
          </button>
        )}
        <button onClick={() => onToggleFavorite(image.id)}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          style={{ background: isFav ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)', color: isFav ? '#ef4444' : '#fff' }}
          onMouseEnter={e => e.currentTarget.style.background = isFav ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = isFav ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}>
          <Heart size={16} fill={isFav ? '#ef4444' : 'none'} />
        </button>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
          <X size={16} />
        </button>
      </div>

      {/* Prev */}
      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Image */}
      <img
        src={getPreviewUrl(image.preview_r2_key, token)}
        alt={image.file_name}
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: 4 }}
      />

      {/* Next */}
      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
          <ChevronRight size={20} />
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs"
        style={{ color: 'rgba(255,255,255,0.5)' }}>
        {index + 1} / {images.length}
      </div>
    </div>
  )
}

// ── PIN Gate ─────────────────────────────────────────────────────────────────

function PinGate({ onSubmit, error, loading }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="text-center space-y-1">
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Download PIN required</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Enter the 4-digit PIN to download
          </p>
        </div>
        <input
          type="number"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value.slice(0, 4))}
          placeholder="0000"
          autoFocus
          className="w-full text-center text-2xl tracking-widest font-mono rounded-xl py-3"
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        {error && <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button
          onClick={() => onSubmit(pin)}
          disabled={pin.length !== 4 || loading}
          className="w-full py-2.5 rounded-xl font-medium text-sm transition-opacity"
          style={{ background: '#6366f1', color: '#fff', opacity: pin.length !== 4 || loading ? 0.5 : 1 }}>
          {loading ? 'Verifying…' : 'Download'}
        </button>
      </div>
    </div>
  )
}

// ── Comment Thread ────────────────────────────────────────────────────────────

function CommentThread({ galleryId, imageId, viewerId, allowComments }) {
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getComments(galleryId, imageId).then(setComments).catch(console.error)
  }, [galleryId, imageId])

  async function handleSubmit() {
    if (!body.trim() || !viewerId) return
    setSubmitting(true)
    try {
      const c = await addComment(galleryId, imageId, viewerId, body.trim())
      setComments(prev => [...prev, c])
      setBody('')
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No comments yet.</p>
      )}
      {comments.map(c => (
        <div key={c.id} className="space-y-0.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            {c.gallery_viewers?.display_name || c.photographers?.display_name || 'Unknown'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{c.body}</p>
        </div>
      ))}
      {allowComments && viewerId && (
        <div className="flex gap-2 pt-1">
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a comment…"
            className="flex-1 text-sm rounded-lg px-3 py-2"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="text-sm px-3 py-2 rounded-lg font-medium transition-opacity"
            style={{ background: '#6366f1', color: '#fff', opacity: !body.trim() || submitting ? 0.5 : 1 }}>
            Post
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function ClientGalleryView() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [viewer, setViewer] = useState(null)
  const [favorites, setFavorites] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [activeCommentImageId, setActiveCommentImageId] = useState(null)

  const [showPinGate, setShowPinGate] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pendingDownload, setPendingDownload] = useState(null) // { type: 'single'|'zip', image? }

  const [downloadingZip, setDownloadingZip] = useState(false)
  const [heroUrl, setHeroUrl] = useState(null)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      setLoading(true)
      const g = await getGalleryByToken(token)

      if (!g || !g.is_active) {
        navigate(`/g/${token}`, { replace: true })
        return
      }

      const v = getViewerFromSession(g.id)
      if (!v) {
        navigate(`/g/${token}`, { replace: true })
        return
      }

      const [imgs, favs] = await Promise.all([
        getClientImages(g.id),
        getViewerFavorites(g.id, v.id),
      ])

      setGallery(g)
      setImages(imgs)
      setViewer(v)
      setFavorites(favs)

      // Resolve cover image URL
      if (g.cover_r2_key) {
        setHeroUrl(`${import.meta.env.VITE_R2_WORKER_URL}/preview/${encodeURIComponent(g.cover_r2_key)}?share_token=${token}`)
      } else if (g.cover_image_id && imgs.length > 0) {
        const coverImg = imgs.find(i => i.id === g.cover_image_id) || imgs[0]
        if (coverImg) setHeroUrl(getPreviewUrl(coverImg.preview_r2_key, token))
      } else if (imgs.length > 0) {
        setHeroUrl(getPreviewUrl(imgs[0].preview_r2_key, token))
      }
    } catch (err) {
      setError('Could not load gallery.')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleFavorite(imageId) {
    if (!gallery.allow_favorites || !viewer) return
    const nowFav = await toggleFavorite(gallery.id, imageId, viewer.id)
    setFavorites(prev => {
      const next = new Set(prev)
      nowFav ? next.add(imageId) : next.delete(imageId)
      return next
    })
  }

  function handleDownloadSingle(image) {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) {
      setPendingDownload({ type: 'single', image })
      setShowPinGate(true)
    } else {
      downloadOriginal(image.original_r2_key, image.file_name, token)
    }
  }

  function handleDownloadZip() {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) {
      setPendingDownload({ type: 'zip' })
      setShowPinGate(true)
    } else {
      doZipDownload()
    }
  }

  async function doZipDownload(pin = null) {
    setDownloadingZip(true)
    try {
      await downloadZip(gallery.id, token, images.map(i => i.original_r2_key), pin)
    } catch (err) {
      console.error(err)
    } finally {
      setDownloadingZip(false)
    }
  }

  async function handlePinSubmit(pin) {
    setPinLoading(true)
    setPinError('')
    try {
      const valid = await verifyDownloadPin(gallery.id, pin)
      if (!valid) {
        setPinError('Incorrect PIN. Please try again.')
        return
      }
      setShowPinGate(false)
      if (pendingDownload?.type === 'single') {
        await downloadOriginal(pendingDownload.image.original_r2_key, pendingDownload.image.file_name, token, pin)
      } else {
        await doZipDownload(pin)
      }
      setPendingDownload(null)
    } catch {
      setPinError('Something went wrong.')
    } finally {
      setPinLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !gallery) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error || 'Gallery not found.'}</p>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Hero */}
      {heroUrl && (
        <div className="relative w-full overflow-hidden" style={{ height: '70vh', minHeight: 400 }}>
          <img
            src={heroUrl}
            alt={gallery.title}
            className="w-full h-full"
            style={{
              objectFit: 'cover',
              objectPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`,
            }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)' }} />
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-8">
            {gallery.client_name && (
              <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {gallery.client_name}
              </p>
            )}
            <h1 className="text-3xl font-bold mb-1" style={{ color: '#fff' }}>{gallery.title}</h1>
            {gallery.event_date && (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sticky nav */}
      <div className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
        {gallery.allow_downloads && (
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', opacity: downloadingZip ? 0.5 : 1, cursor: downloadingZip ? 'not-allowed' : 'pointer' }}>
            <Download size={14} />
            {downloadingZip ? 'Preparing…' : 'Download All'}
          </button>
        )}
      </div>

      {/* Image Grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {images.map((image, i) => (
          <div key={image.id}
            className="relative overflow-hidden rounded-lg group cursor-pointer"
            onClick={() => setLightboxIndex(i)}>
            <img
              src={getPreviewUrl(image.preview_r2_key, token)}
              alt={image.file_name}
              loading="lazy"
              className="w-full block"
              style={{ borderRadius: 8 }}
            />
            {/* Overlay */}
            <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }}>
              <div className="flex items-center gap-1.5">
                {gallery.allow_favorites && (
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleFavorite(image.id) }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)' }}>
                    <Heart size={13} fill={favorites.has(image.id) ? '#ef4444' : 'none'}
                      style={{ color: favorites.has(image.id) ? '#ef4444' : '#fff' }} />
                  </button>
                )}
                {gallery.allow_comments && (
                  <button
                    onClick={e => { e.stopPropagation(); setActiveCommentImageId(image.id) }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)' }}>
                    <MessageCircle size={13} style={{ color: '#fff' }} />
                  </button>
                )}
              </div>
              {gallery.allow_downloads && (
                <button
                  onClick={e => { e.stopPropagation(); handleDownloadSingle(image) }}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <Download size={13} style={{ color: '#fff' }} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(images.length - 1, i + 1))}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          allowDownloads={gallery.allow_downloads}
          onDownload={handleDownloadSingle}
          token={token}
        />
      )}

      {/* Comment drawer */}
      {activeCommentImageId && (
        <div className="fixed inset-0 z-40 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setActiveCommentImageId(null)}>
          <div
            className="w-full max-w-lg rounded-t-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', maxHeight: '60vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>Comments</p>
              <button onClick={() => setActiveCommentImageId(null)}
                style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <CommentThread
              galleryId={gallery.id}
              imageId={activeCommentImageId}
              viewerId={viewer?.id}
              allowComments={gallery.allow_comments}
            />
          </div>
        </div>
      )}

      {/* PIN gate */}
      {showPinGate && (
        <PinGate
          onSubmit={handlePinSubmit}
          error={pinError}
          loading={pinLoading}
        />
      )}
    </div>
  )
}
