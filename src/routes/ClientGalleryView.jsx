import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Heart, Download, X, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import {
  getGalleryByToken, getClientImages, getViewerFromSession,
  getViewerFavorites, toggleFavorite, getComments, addComment,
  getPreviewUrl, downloadOriginal, downloadPreview, downloadZip, verifyDownloadPin, logActivity
} from '../utils/clientApi.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function noContext(e) { e.preventDefault() }

const THEME_COLORS = {
  light:      { bg: '#ffffff', surface: '#f8f8f8', text: '#1a1a1a', muted: '#6b7280', border: '#e5e7eb', accent: '#6366f1' },
  gold:       { bg: '#faf8f3', surface: '#f0ead6', text: '#1a1a1a', muted: '#8a7d5a', border: '#d4c89a', accent: '#b8963e' },
  rose:       { bg: '#fdf8f8', surface: '#f5e8e8', text: '#1a1a1a', muted: '#9a7070', border: '#e8c8c8', accent: '#b06080' },
  terracotta: { bg: '#faf6f3', surface: '#f0e4d8', text: '#1a1a1a', muted: '#8a6a58', border: '#d4b8a0', accent: '#c07050' },
  sand:       { bg: '#faf8f5', surface: '#ede8df', text: '#1a1a1a', muted: '#8a7d6a', border: '#d4c8b0', accent: '#9a8060' },
  olive:      { bg: '#f8faf5', surface: '#e4ead8', text: '#1a1a1a', muted: '#6a7a58', border: '#c0caa0', accent: '#6a8040' },
  agave:      { bg: '#f5faf8', surface: '#dceae4', text: '#1a1a1a', muted: '#507a68', border: '#a0c8b8', accent: '#408060' },
  sea:        { bg: '#f5f8fa', surface: '#dce4ea', text: '#1a1a1a', muted: '#507080', border: '#a0b8c8', accent: '#406080' },
  dark:       { bg: '#111111', surface: '#1e1e1e', text: '#f0f0f0', muted: '#9ca3af', border: '#333333', accent: '#6366f1' },
}

function DownloadMenu({ allowWebSize, allowHires, onDownload, loading }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const hasBoth = allowWebSize && allowHires

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!allowWebSize && !allowHires) return null

  if (!hasBoth) {
    return (
      <button onClick={() => onDownload(!!allowHires)} disabled={loading}
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
        <Download size={16} />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} disabled={loading}
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: open ? 'var(--surface-raised)' : 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
        <Download size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-40 w-36"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {allowWebSize && (
            <button onClick={() => { onDownload(false); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm"
              style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Web Size
            </button>
          )}
          {allowHires && (
            <button onClick={() => { onDownload(true); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm"
              style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              High Resolution
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function GridDownloadButton({ allowWebSize, allowHires, onDownload }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const hasBoth = allowWebSize && allowHires

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleClick(e) {
    e.stopPropagation()
    if (hasBoth) { setOpen(!open); return }
    onDownload(!!allowHires)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={handleClick}
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.5)', cursor: 'pointer' }}>
        <Download size={13} style={{ color: '#fff' }} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 rounded-xl shadow-lg overflow-hidden w-28 z-50"
          style={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {allowWebSize && (
            <button onClick={e => { e.stopPropagation(); onDownload(false); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs"
              style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Web Size
            </button>
          )}
          {allowHires && (
            <button onClick={e => { e.stopPropagation(); onDownload(true); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs"
              style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              High Res
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function LightboxDownloadButton({ allowWebSize, allowHires, onDownload }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const hasBoth = allowWebSize && allowHires

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleClick(e) {
    e.stopPropagation()
    if (hasBoth) { setOpen(!open); return }
    onDownload(!!allowHires)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={handleClick}
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
        <Download size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 rounded-xl shadow-lg overflow-hidden w-32 z-50"
          style={{ background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {allowWebSize && (
            <button onClick={e => { e.stopPropagation(); onDownload(false); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm"
              style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Web Size
            </button>
          )}
          {allowHires && (
            <button onClick={e => { e.stopPropagation(); onDownload(true); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm"
              style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              High Resolution
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Lightbox({ images, index, onClose, onPrev, onNext, favorites, onToggleFavorite, allowDownloads, allowWebSize, allowHires, onDownload, token }) {
  const image = images[index]
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const [displayIndex, setDisplayIndex] = useState(index)
  const [slideStyle, setSlideStyle] = useState({ opacity: 1, transform: 'translateX(0)', transition: 'none' })

  useEffect(() => {
    if (index === displayIndex) return
    const dir = index > displayIndex ? 1 : -1
    // Slide current image out (opposite direction)
    setSlideStyle({ opacity: 0, transform: `translateX(${dir * -50}px)`, transition: 'transform 0.22s ease, opacity 0.22s ease' })
    const t = setTimeout(() => {
      setDisplayIndex(index)
      // New image starts off-screen in the direction we're coming from
      setSlideStyle({ opacity: 0, transform: `translateX(${dir * 50}px)`, transition: 'none' })
      // Then animate it into center
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setSlideStyle({ opacity: 1, transform: 'translateX(0)', transition: 'transform 0.22s ease, opacity 0.22s ease' })
      }))
    }, 200)
    return () => clearTimeout(t)
  }, [index])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onPrev, onNext])

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (Math.abs(dx) > 50 && dy < 80) {
      if (dx < 0) onNext()
      else onPrev()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  if (!image) return null
  const displayImage = images[displayIndex] || image
  const isFav = favorites.has(image.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onContextMenu={noContext}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-20"
        onClick={e => e.stopPropagation()}>
        {allowDownloads && (
          <LightboxDownloadButton
            allowWebSize={allowWebSize}
            allowHires={allowHires}
            onDownload={hires => onDownload(image, hires)}
          />
        )}
        <button onClick={() => onToggleFavorite(image.id)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: isFav ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)', color: isFav ? '#ef4444' : '#fff', cursor: 'pointer' }}>
          <Heart size={16} fill={isFav ? '#ef4444' : 'none'} />
        </button>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center z-20"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
      )}

      <div className="relative" onClick={e => e.stopPropagation()} style={slideStyle}>
        <img
          src={getPreviewUrl(displayImage.preview_r2_key, token)}
          alt=""
          draggable={false}
          onContextMenu={noContext}
          style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', borderRadius: 4, display: 'block', userSelect: 'none', pointerEvents: 'none' }}
        />
        <div className="absolute inset-0 z-10" onContextMenu={noContext} />
      </div>

      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-4 w-10 h-10 rounded-full flex items-center justify-center z-20"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>
          <ChevronRight size={20} />
        </button>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs"
        style={{ color: 'rgba(255,255,255,0.5)' }}>
        {index + 1} / {images.length}
      </div>
    </div>
  )
}

function PinGate({ onSubmit, onCancel, error, loading }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold" style={{ color: 'var(--text)' }}>Download PIN required</p>
          <button onClick={onCancel} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enter the 4-digit PIN to download</p>
        <input type="number" maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.slice(0, 4))}
          placeholder="0000" autoFocus
          className="w-full text-center text-2xl tracking-widest font-mono rounded-xl py-3"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
        />
        {error && <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => onSubmit(pin)} disabled={pin.length !== 4 || loading}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm"
            style={{ background: '#6366f1', color: '#fff', opacity: pin.length !== 4 || loading ? 0.5 : 1, cursor: pin.length !== 4 || loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Verifying…' : 'Download'}
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

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
      {comments.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No comments yet.</p>}
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
          <input value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a comment…"
            className="flex-1 text-sm rounded-lg px-3 py-2"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
          />
          <button onClick={handleSubmit} disabled={!body.trim() || submitting}
            className="text-sm px-3 py-2 rounded-lg font-medium"
            style={{ background: '#6366f1', color: '#fff', opacity: !body.trim() || submitting ? 0.5 : 1, cursor: !body.trim() || submitting ? 'not-allowed' : 'pointer' }}>
            Post
          </button>
        </div>
      )}
    </div>
  )
}

export default function ClientGalleryView() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [viewer, setViewer] = useState(null)
  const [favorites, setFavorites] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [heroUrl, setHeroUrl] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [activeCommentImageId, setActiveCommentImageId] = useState(null)
  const [showPinGate, setShowPinGate] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pendingDownload, setPendingDownload] = useState(null)
  const [downloadingZip, setDownloadingZip] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      setLoading(true)
      const g = await getGalleryByToken(token)
      if (!g || !g.is_active) { navigate(`/g/${token}`, { replace: true }); return }
      const v = getViewerFromSession(g.id)
      if (!v) { navigate(`/g/${token}`, { replace: true }); return }
      const [imgs, favs] = await Promise.all([getClientImages(g.id), getViewerFavorites(g.id, v.id)])
      setGallery(g); setImages(imgs); setViewer(v); setFavorites(favs)
      logActivity(g.id, v.id, 'view')
      if (g.cover_r2_key) {
        setHeroUrl(`${WORKER_URL}/preview/${encodeURIComponent(g.cover_r2_key)}?share_token=${token}`)
      } else if (g.cover_image_id && imgs.length > 0) {
        const coverImg = imgs.find(i => i.id === g.cover_image_id) || imgs[0]
        if (coverImg) setHeroUrl(getPreviewUrl(coverImg.preview_r2_key, token))
      } else if (imgs.length > 0) {
        setHeroUrl(getPreviewUrl(imgs[0].preview_r2_key, token))
      }
    } catch { setError('Could not load gallery.') }
    finally { setLoading(false) }
  }

  async function handleToggleFavorite(imageId) {
    if (!gallery.allow_favorites || !viewer) return
    const nowFav = await toggleFavorite(gallery.id, imageId, viewer.id)
    setFavorites(prev => { const next = new Set(prev); nowFav ? next.add(imageId) : next.delete(imageId); return next })
    logActivity(gallery.id, viewer.id, nowFav ? 'favorite' : 'unfavorite', imageId)
  }

  function handleDownloadSingle(image, hires = false) {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) {
      setPendingDownload({ type: 'single', image, hires }); setShowPinGate(true)
    } else {
      if (hires) downloadOriginal(image.original_r2_key, image.file_name, token)
      else downloadPreview(image.preview_r2_key, image.file_name.replace(/\.[^.]+$/, '_web.jpg'), token)
      logActivity(gallery.id, viewer?.id, 'download_single', image.id)
    }
  }

  function handleDownloadZip(hires = false) {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) { setPendingDownload({ type: 'zip', hires }); setShowPinGate(true) }
    else doZipDownload(null, hires)
  }

  async function doZipDownload(pin = null, hires = false) {
    setDownloadingZip(true)
    try {
      const keys = hires ? images.map(i => i.original_r2_key) : images.map(i => i.preview_r2_key)
      const names = hires ? images.map(i => i.file_name) : images.map(i => i.file_name.replace(/\.[^.]+$/, '_web.jpg'))
      await downloadZip(gallery.id, token, keys, names, gallery.title, pin)
      logActivity(gallery.id, viewer?.id, 'download_all')
    } catch (err) { console.error(err) }
    finally { setDownloadingZip(false) }
  }

  async function handlePinSubmit(pin) {
    setPinLoading(true); setPinError('')
    try {
      const valid = await verifyDownloadPin(gallery.id, pin)
      if (!valid) { setPinError('Incorrect PIN. Please try again.'); return }
      setShowPinGate(false)
      if (pendingDownload?.type === 'single') {
        if (pendingDownload.hires) await downloadOriginal(pendingDownload.image.original_r2_key, pendingDownload.image.file_name, token, pin)
        else await downloadPreview(pendingDownload.image.preview_r2_key, pendingDownload.image.file_name.replace(/\.[^.]+$/, '_web.jpg'), token)
        logActivity(gallery.id, viewer?.id, 'download_single', pendingDownload.image.id)
      } else {
        await doZipDownload(pin, pendingDownload?.hires || false)
      }
      setPendingDownload(null)
    } catch { setPinError('Something went wrong.') }
    finally { setPinLoading(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fff' }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !gallery) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#fff' }}>
      <p className="text-sm" style={{ color: '#6b7280' }}>{error || 'Gallery not found.'}</p>
    </div>
  )

  const theme = THEME_COLORS[gallery.theme_color || 'light'] || THEME_COLORS.light
  const gridCols = gallery.grid_size === 'large' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
  const gridGap = gallery.grid_spacing === 'large' ? 'gap-4' : 'gap-1'
  const gridPad = gallery.grid_spacing === 'large' ? 'p-4' : 'p-1'
  const themeStyle = { '--bg': theme.bg, '--surface': theme.surface, '--surface-raised': theme.surface, '--text': theme.text, '--text-muted': theme.muted, '--text-secondary': theme.muted, '--border': theme.border, '--accent': theme.accent }
  const eventDateStr = gallery.event_date ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    <div className="min-h-screen" style={{ background: theme.bg, ...themeStyle }} onContextMenu={noContext}>

      {heroUrl && (
        <div className="relative w-full overflow-hidden" style={{ height: '100vh', minHeight: 500 }}>
          <img src={heroUrl} alt="" draggable={false} onContextMenu={noContext} className="w-full h-full"
            style={{ objectFit: 'cover', objectPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`, userSelect: 'none' }}
          />
          <div className="absolute inset-0" style={{ zIndex: 1 }} onContextMenu={noContext} />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)', zIndex: 2 }} />
          <div className="absolute bottom-0 left-0 right-0 px-8 pb-8 pointer-events-none" style={{ zIndex: 3 }}>
            <h1 className="text-3xl font-bold mb-1" style={{ color: '#fff' }}>{gallery.title}</h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {[gallery.client_name, eventDateStr].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between"
        style={{ background: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
        <h1 className="text-sm font-semibold truncate" style={{ color: theme.text }}>{gallery.title}</h1>
        {gallery.allow_downloads && (
          <DownloadMenu allowWebSize={gallery.download_watermarked} allowHires={gallery.allow_hires_download} onDownload={handleDownloadZip} loading={downloadingZip} />
        )}
      </div>

      <div className={`${gridPad} grid ${gridCols} ${gridGap}`}>
        {images.map((image, i) => (
          <div key={image.id} className="relative overflow-hidden rounded-lg group" style={{ cursor: 'pointer' }} onClick={() => setLightboxIndex(i)}>
            <img src={getPreviewUrl(image.preview_r2_key, token)} alt="" loading="lazy" draggable={false} onContextMenu={noContext}
              className="w-full block aspect-square" style={{ objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }} />
            <div className="absolute inset-0 flex items-end justify-between p-2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)', zIndex: 2 }} onContextMenu={noContext}>
              <div className="flex items-center gap-1.5">
                {gallery.allow_favorites && (
                  <button onClick={e => { e.stopPropagation(); handleToggleFavorite(image.id) }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }}>
                    <Heart size={13} fill={favorites.has(image.id) ? '#ef4444' : 'none'} style={{ color: favorites.has(image.id) ? '#ef4444' : '#fff' }} />
                  </button>
                )}
                {gallery.allow_comments && (
                  <button onClick={e => { e.stopPropagation(); setActiveCommentImageId(image.id) }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)', cursor: 'pointer' }}>
                    <MessageCircle size={13} style={{ color: '#fff' }} />
                  </button>
                )}
              </div>
              {gallery.allow_downloads && (
                <div onClick={e => e.stopPropagation()}>
                  <GridDownloadButton allowWebSize={gallery.download_watermarked} allowHires={gallery.allow_hires_download} onDownload={hires => handleDownloadSingle(image, hires)} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(images.length - 1, i + 1))}
          favorites={favorites} onToggleFavorite={handleToggleFavorite}
          allowDownloads={gallery.allow_downloads} allowWebSize={gallery.download_watermarked} allowHires={gallery.allow_hires_download}
          onDownload={handleDownloadSingle} token={token}
        />
      )}

      {activeCommentImageId && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setActiveCommentImageId(null)}>
          <div className="w-full max-w-lg rounded-t-2xl p-6 space-y-4" style={{ background: theme.surface, maxHeight: '60vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm" style={{ color: theme.text }}>Comments</p>
              <button onClick={() => setActiveCommentImageId(null)} style={{ color: theme.muted, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <CommentThread galleryId={gallery.id} imageId={activeCommentImageId} viewerId={viewer?.id} allowComments={gallery.allow_comments} />
          </div>
        </div>
      )}

      {showPinGate && (
        <PinGate onSubmit={handlePinSubmit} onCancel={() => { setShowPinGate(false); setPinError(''); setPendingDownload(null) }} error={pinError} loading={pinLoading} />
      )}
    </div>
  )
}
