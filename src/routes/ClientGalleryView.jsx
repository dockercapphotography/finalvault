import { useState, useEffect, useRef } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Heart, Download, X, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import {
  getGalleryByToken, getClientImages, getViewerFromSession,
  getViewerFavorites, toggleFavorite, getComments, addComment,
  getPreviewUrl, downloadWebSize, downloadHiRes, downloadZip, verifyDownloadPin, logActivity,
  getClientSets
} from '../utils/clientApi.js'
import { getTheme } from '../utils/themes.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function noContext(e) { e.preventDefault() }

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

function Lightbox({ images, index, onClose, onPrev, onNext, favorites, onToggleFavorite, allowDownloads, allowWebSize, allowHires, onDownload, allowComments, onComment, token }) {
  const image = images[index]
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const scaleRef = useRef(1)
  const [isZoomed, setIsZoomed] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

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
    if (scaleRef.current > 1) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null || scaleRef.current > 1) return
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
        {allowComments && (
          <button onClick={() => onComment(image.id)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}>
            <MessageCircle size={16} />
          </button>
        )}
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

      <div className="relative" onClick={e => e.stopPropagation()}>
        <TransformWrapper
          key={index}
          initialScale={1}
          minScale={1}
          maxScale={4}
          doubleClick={{ mode: 'toggle' }}
          onTransformed={(_, state) => {
            scaleRef.current = state.scale
            setIsZoomed(state.scale > 1)
          }}
          wheel={{ step: 0.1 }}
          panning={{ disabled: !isZoomed }}
        >
          <TransformComponent
            wrapperStyle={{ maxHeight: '90vh', maxWidth: '90vw' }}
            contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img
              src={getPreviewUrl(image.preview_r2_key, token, image.updated_at)}
              alt=""
              draggable={false}
              onContextMenu={noContext}
              style={{
                maxHeight: '90vh',
                maxWidth: '90vw',
                objectFit: 'contain',
                borderRadius: 4,
                display: 'block',
                userSelect: 'none',
                animation: 'lbFadeIn 0.18s ease',
              }}
            />
          </TransformComponent>
        </TransformWrapper>
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

      <style>{`@keyframes lbFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}

function PinGate({ onSubmit, onCancel, error, loading }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <style>{`.pin-input::placeholder { color: rgba(240,240,240,0.15); } .comment-input::placeholder { color: rgba(240,240,240,0.3); }`}</style>
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
        style={{ background: '#1e1e1e', border: '1px solid #333' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold" style={{ color: '#f0f0f0' }}>Download PIN required</p>
          <button onClick={onCancel} style={{ color: '#9ca3af', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <p className="text-sm" style={{ color: '#9ca3af' }}>Enter the 4-digit PIN to download</p>
        <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••" autoFocus
          className="pin-input w-full text-center text-2xl tracking-widest font-mono rounded-xl py-3"
          style={{
            background: '#2a2a2a',
            border: '1px solid #444',
            color: '#f0f0f0',
            outline: 'none',
            WebkitAppearance: 'none',
            WebkitTextFillColor: '#f0f0f0',
          }}
        />
        {error && <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => onSubmit(pin)} disabled={pin.length !== 4 || loading}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm"
            style={{ background: '#6366f1', color: '#fff', opacity: pin.length !== 4 || loading ? 0.5 : 1, cursor: pin.length !== 4 || loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Verifying…' : 'Download'}
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#2a2a2a', color: '#f0f0f0', cursor: 'pointer', border: '1px solid #444' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function ZipProgressModal({ hires, progress, total }) {
  const pct = total > 0 && progress != null ? Math.round((progress / total) * 100) : 0
  const done = progress != null && progress >= total

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-5"
        style={{ background: '#1e1e1e', border: '1px solid #333' }}>

        {/* Icon + title */}
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: done ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)' }}>
            {hires && !done ? (
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
            ) : (
              <Download size={22} style={{ color: '#6366f1' }} />
            )}
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-sm" style={{ color: '#f0f0f0' }}>
              {done ? 'Download ready!' : hires ? 'Preparing your download…' : 'Processing photos…'}
            </p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>
              {done
                ? 'Your ZIP file is downloading now.'
                : hires
                ? `Packaging ${total} photo${total !== 1 ? 's' : ''} — this may take a moment.`
                : `Processing photo ${Math.min((progress ?? 0) + 1, total)} of ${total}`}
            </p>
          </div>
        </div>

        {/* Web size — real progress bar */}
        {!hires && (
          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: '#6366f1' }} />
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#6b7280' }}>
              <span>{progress ?? 0} of {total} photos</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Hires — indeterminate pulse bar */}
        {hires && !done && (
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
            <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: '#6366f1' }} />
          </div>
        )}

        <p className="text-xs text-center" style={{ color: '#4b5563' }}>
          Please keep this window open until complete.
        </p>
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
      <style>{`.comment-input::placeholder { color: rgba(240,240,240,0.3); }`}</style>
      {comments.length === 0 && <p className="text-sm" style={{ color: '#9ca3af' }}>No comments yet.</p>}
      {comments.map(c => (
        <div key={c.id} className="space-y-0.5">
          <p className="text-xs font-medium" style={{ color: '#f0f0f0' }}>
            {c.gallery_viewers?.email ? c.gallery_viewers.email : c.photographers?.display_name || 'Unknown'}
          </p>
          <p className="text-sm" style={{ color: '#9ca3af' }}>{c.body}</p>
        </div>
      ))}
      {allowComments && viewerId && (
        <div className="flex gap-2 pt-1">
          <input value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a comment…"
            className="comment-input flex-1 text-sm rounded-lg px-3 py-2"
            style={{
              background: '#2a2a2a',
              border: '1px solid #444',
              color: '#f0f0f0',
              outline: 'none',
              WebkitAppearance: 'none',
              WebkitTextFillColor: '#f0f0f0',
            }}
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
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1'

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
  const [zipProgress, setZipProgress] = useState(null)  // { current, total, hires }
  const [sets, setSets] = useState([])
  const [activeSetId, setActiveSetId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      setLoading(true)
      const g = await getGalleryByToken(token)
      if (!g || !g.is_active) { navigate(`/g/${token}`, { replace: true }); return }
      const v = getViewerFromSession(g.id)
      if (!v && !isPreview) { navigate(`/g/${token}`, { replace: true }); return }
      const [imgs, favs, setsData] = await Promise.all([getClientImages(g.id), v ? getViewerFavorites(g.id, v.id) : Promise.resolve(new Set()), getClientSets(g.id)])
      setGallery(g); setImages(imgs); setViewer(v); setFavorites(favs)
      setSets(setsData)
      if (setsData.length > 0) setActiveSetId(setsData[0].id)
      if (!isPreview && v) logActivity(g.id, v.id, 'view')
      if (g.cover_r2_key) {
        setHeroUrl(`${WORKER_URL}/preview/${encodeURIComponent(g.cover_r2_key)}?share_token=${token}`)
      } else if (g.cover_image_id && imgs.length > 0) {
        const coverImg = imgs.find(i => i.id === g.cover_image_id) || imgs[0]
        if (coverImg) setHeroUrl(getPreviewUrl(coverImg.preview_r2_key, token, coverImg.updated_at))
      } else if (imgs.length > 0) {
        setHeroUrl(getPreviewUrl(imgs[0].preview_r2_key, token, imgs[0].updated_at))
      }
    } catch { setError('Could not load gallery.') }
    finally { setLoading(false) }
  }

  async function handleToggleFavorite(imageId) {
    if (!gallery.allow_favorites || !viewer) return
    const nowFav = await toggleFavorite(gallery.id, imageId, viewer.id)
    setFavorites(prev => { const next = new Set(prev); nowFav ? next.add(imageId) : next.delete(imageId); return next })
    if (!isPreview) logActivity(gallery.id, viewer.id, nowFav ? 'favorite' : 'unfavorite', imageId)
  }

  function handleDownloadSingle(image, hires = false) {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) {
      setPendingDownload({ type: 'single', image, hires }); setShowPinGate(true)
    } else {
      if (hires) downloadHiRes(image.original_r2_key, image.file_name, token, null)
      else downloadWebSize(image.original_r2_key, image.file_name.replace(/\.[^.]+$/, '_web.jpg'), token, null, image.watermark_id)
      if (!isPreview) logActivity(gallery.id, viewer?.id, 'download_single', image.id)
    }
  }

  function handleDownloadZip(hires = false) {
    if (!gallery.allow_downloads) return
    if (gallery.require_download_pin) { setPendingDownload({ type: 'zip', hires }); setShowPinGate(true) }
    else doZipDownload(null, hires)
  }

  async function doZipDownload(pin = null, hires = false) {
    const total = images.length
    setDownloadingZip(true)
    setZipProgress({ current: 0, total, hires })
    try {
      const keys = images.map(i => i.original_r2_key)
      const names = hires ? images.map(i => i.file_name) : images.map(i => i.file_name.replace(/\.[^.]+$/, '_web.jpg'))
      const watermarkIds = images.map(i => i.watermark_id || null)
      const watermarkConfigs = images.map(i => i.watermarks || null)
      await downloadZip(
        gallery.id, token, keys, names, gallery.title, pin,
        hires ? 'hires' : 'web',
        watermarkIds,
        watermarkConfigs,
        hires ? null : (current, t) => setZipProgress(prev => ({ ...prev, current }))
      )
      if (!isPreview) logActivity(gallery.id, viewer?.id, 'download_all')
      // Show completion state briefly before closing
      setZipProgress(prev => ({ ...prev, current: total }))
      await new Promise(r => setTimeout(r, 1200))
    } catch (err) { console.error(err) }
    finally { setDownloadingZip(false); setZipProgress(null) }
  }

  async function handlePinSubmit(pin) {
    setPinLoading(true); setPinError('')
    try {
      const valid = await verifyDownloadPin(gallery.id, pin)
      if (!valid) { setPinError('Incorrect PIN. Please try again.'); return }
      setShowPinGate(false)
      if (pendingDownload?.type === 'single') {
        if (pendingDownload.hires) await downloadHiRes(pendingDownload.image.original_r2_key, pendingDownload.image.file_name, token, pin)
        else await downloadWebSize(pendingDownload.image.original_r2_key, pendingDownload.image.file_name.replace(/\.[^.]+$/, '_web.jpg'), token, pin, pendingDownload.image.watermark_id)
        if (!isPreview) logActivity(gallery.id, viewer?.id, 'download_single', pendingDownload.image.id)
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

  const activeImages = activeSetId ? images.filter(i => i.set_id === activeSetId) : images
  const theme = getTheme(gallery.theme_color || 'light')
  const gridCols = gallery.grid_size === 'large' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
  const gridGap = gallery.grid_spacing === 'large' ? 'gap-4' : 'gap-1'
  const gridPad = gallery.grid_spacing === 'large' ? 'p-4' : 'p-1'
  const themeStyle = { '--bg': theme.bg, '--surface': theme.surface, '--surface-raised': theme.surface, '--text': theme.text, '--text-muted': theme.muted, '--text-secondary': theme.muted, '--border': theme.border, '--accent': theme.accent }
  const eventDateStr = gallery.event_date ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null

  return (
    <div className="min-h-screen" style={{ background: theme.bg, ...themeStyle }} onContextMenu={noContext}>

      {isPreview && (
        <div style={{ background: '#6366f1', color: '#fff', textAlign: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 500, letterSpacing: '0.01em' }}>
          Preview Mode — This is how your client sees the gallery
        </div>
      )}

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
              {[gallery.client_name, gallery.event_name, eventDateStr].filter(Boolean).join(' · ')}
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

      {/* Set tabs */}
      {sets.length > 1 && (
        <div className="overflow-x-auto"
          style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bg }}>
          <div className="flex items-center min-w-max px-4">
            {sets.map(set => (
              <button
                key={set.id}
                onClick={() => setActiveSetId(set.id)}
                className="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative"
                style={{
                  color: activeSetId === set.id ? theme.text : theme.muted,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}>
                {set.name}
                {activeSetId === set.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: theme.accent }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${gridPad} grid ${gridCols} ${gridGap}`}>
        {activeImages.map((image, i) => (
          <div key={image.id} className="relative overflow-hidden rounded-lg group" style={{ cursor: 'pointer' }} onClick={() => setLightboxIndex(i)}>
            <img src={getPreviewUrl(image.preview_r2_key, token, image.updated_at)} alt="" loading="lazy" draggable={false} onContextMenu={noContext}
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
        <Lightbox images={activeImages} index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(activeImages.length - 1, i + 1))}
          favorites={favorites} onToggleFavorite={handleToggleFavorite}
          allowDownloads={gallery.allow_downloads} allowWebSize={gallery.download_watermarked} allowHires={gallery.allow_hires_download}
          onDownload={handleDownloadSingle} allowComments={gallery.allow_comments} onComment={setActiveCommentImageId} token={token}
        />
      )}

      {activeCommentImageId && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setActiveCommentImageId(null)}>
          <div className="w-full max-w-lg rounded-t-2xl p-6 space-y-4" style={{ background: '#1e1e1e', border: '1px solid #333', borderBottom: 'none', maxHeight: '60vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm" style={{ color: '#f0f0f0' }}>Comments</p>
              <button onClick={() => setActiveCommentImageId(null)} style={{ color: '#9ca3af', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <CommentThread galleryId={gallery.id} imageId={activeCommentImageId} viewerId={viewer?.id} allowComments={gallery.allow_comments} />
          </div>
        </div>
      )}

      {showPinGate && (
        <PinGate onSubmit={handlePinSubmit} onCancel={() => { setShowPinGate(false); setPinError(''); setPendingDownload(null) }} error={pinError} loading={pinLoading} />
      )}

      {downloadingZip && zipProgress && (
        <ZipProgressModal
          hires={zipProgress.hires}
          progress={zipProgress.current}
          total={zipProgress.total}
        />
      )}


    </div>
  )
}
