import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Eye, Heart, HeartOff, MessageCircle, Download, Package, CheckCircle, X, ChevronLeft, ChevronRight, MoreVertical, Trash2 } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { getFolderAncestors, buildGalleryCrumbs, addPhotographerReply } from '../utils/galleryApi.js'
import { formatDate } from '../utils/formatters.js'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import { useScrollLock } from '../hooks/useScrollLock.js'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'

const ACTION_CONFIG = {
  view:            { icon: Eye,          label: 'Viewed gallery',        color: '#6366f1' },
  favorite:        { icon: Heart,        label: 'Favorited a photo',     color: '#ef4444' },
  unfavorite:      { icon: HeartOff,     label: 'Unfavorited a photo',   color: '#9ca3af' },
  comment:         { icon: MessageCircle,label: 'Left a comment',        color: '#f59e0b' },
  reply:           { icon: MessageCircle,label: 'You replied',           color: '#6366f1' },
  download_single: { icon: Download,     label: 'Downloaded a photo',    color: '#10b981' },
  download_all:    { icon: Package,      label: 'Downloaded all photos', color: '#10b981' },
  selection_submitted: { icon: CheckCircle, label: 'Submitted selections', color: '#8b5cf6' },
}

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}

function initials(str) {
  if (!str) return '?'
  const parts = str.split('@')[0].split(/[._-]/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || str[0].toUpperCase()
}

const AVATAR_COLORS = [
  { bg: 'rgba(99,102,241,0.15)',  color: '#6366f1' },
  { bg: 'rgba(16,185,129,0.15)',  color: '#10b981' },
  { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  { bg: 'rgba(139,92,246,0.15)',  color: '#8b5cf6' },
  { bg: 'rgba(20,184,166,0.15)',  color: '#14b8a6' },
]

function avatarColor(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function FavoritesLightbox({ images, startIndex, authToken, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const touchStartX = useRef(null)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex(i => Math.min(images.length - 1, i + 1))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [images.length, onClose])

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) dx < 0
      ? setIndex(i => Math.min(images.length - 1, i + 1))
      : setIndex(i => Math.max(0, i - 1))
    touchStartX.current = null
  }

  const img = images[index]
  if (!img) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}>
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center z-10"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
        <X size={16} />
      </button>
      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); setIndex(i => i - 1) }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
      )}
      <img
        src={`${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${authToken}`}
        alt={img.file_name}
        draggable={false}
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', maxWidth: '85vw', objectFit: 'contain', borderRadius: 4, userSelect: 'none' }}
      />
      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setIndex(i => i + 1) }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <ChevronRight size={20} />
        </button>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <p className="text-xs px-3 py-1 rounded-full"
          style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)' }}>
          {img.file_name}
        </p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {index + 1} of {images.length}
        </p>
      </div>
    </div>
  )
}

// ── Panel Content ─────────────────────────────────────────────────────────────
function PanelContent({ viewer, color, lastUpdated, sortedFaves, totalImages, authToken, onClose, onOpenLightbox, onDeleted, galleryId }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  async function handleDelete() {
    setDeleting(true)
    try {
      await supabase
        .from('gallery_favorites')
        .delete()
        .eq('gallery_id', galleryId)
        .eq('viewer_id', viewer.id)
      onDeleted(viewer.id)
      onClose()
    } catch (err) {
      console.error('Failed to delete favorites:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
            style={{ background: color.bg, color: color.color }}>
            {initials(viewer.email || viewer.display_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {viewer.email || viewer.display_name || 'Unknown'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {sortedFaves.length} of {totalImages ?? '?'} images favorited
            </p>
            {lastUpdated && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Updated {formatDateTime(lastUpdated)}
              </p>
            )}
          </div>
        </div>

        {/* ⋮ menu */}
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: menuOpen ? 'var(--surface-raised)' : 'transparent',
              color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
            }}>
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-10"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}>
              <button
                onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-subtle)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Trash2 size={14} />
                Delete
              </button>

            </div>
          )}
        </div>
      </div>

      {/* Confirm delete — replaces header area */}
      {confirmDelete && (
        <div className="px-5 py-4 flex-shrink-0"
          style={{ background: 'var(--danger-subtle)', borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--danger)' }}>
            Delete {viewer.email || viewer.display_name}'s favorites?
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--danger)', opacity: 0.8 }}>
            All {sortedFaves.length} favorited images will be removed. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image list */}
      <div className="flex-1 overflow-y-auto" style={{ opacity: confirmDelete ? 0.35 : 1, transition: 'opacity 0.2s' }}>
        {sortedFaves.map((fav, i) => (
          <div key={fav.id}
            className="flex items-center gap-3 px-5 py-3"
            style={{
              borderBottom: '1px solid var(--border)',
              background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg-subtle)',
            }}>
            <button
              onClick={() => !confirmDelete && onOpenLightbox(i)}
              className="flex-shrink-0 rounded-lg overflow-hidden"
              style={{ width: 52, height: 52, background: 'var(--surface-raised)', border: 'none', padding: 0, cursor: confirmDelete ? 'default' : 'pointer' }}>
              <img
                src={`${WORKER_URL}/preview/${encodeURIComponent(fav.preview_r2_key)}?token=${authToken}`}
                alt={fav.file_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                loading="lazy"
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{fav.file_name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateTime(fav.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Client Favorites Panel ────────────────────────────────────────────────────
function ClientFavoritesPanel({ viewer, favorites, authToken, totalImages, onClose, onDeleted, galleryId }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [visible, setVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const color = avatarColor(viewer.email || viewer.display_name)

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])


  useScrollLock(true)

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    function handleKey(e) { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  const sortedFaves = [...favorites].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const lastUpdated = sortedFaves[0]?.created_at

  const panelProps = { viewer, color, lastUpdated, sortedFaves, totalImages, authToken, onClose: handleClose, onOpenLightbox: setLightboxIndex, onDeleted, galleryId }

  return (
    <>


      {/* Mobile: bottom sheet */}
      {isMobile && (
        <BottomSheet open={true} onClose={handleClose}>
          <PanelContent {...panelProps} />
        </BottomSheet>
      )}

      {/* Desktop: right slide-in */}
      {!isMobile && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{
              background: 'rgba(0,0,0,0.15)',
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.28s cubic-bezier(0.32,0.72,0,1)',
            }}
            onClick={handleClose}
          />
          <div
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
            style={{
              width: 400,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              transform: visible ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
            }}>
            <PanelContent {...panelProps} />
          </div>
        </>
      )}

      {lightboxIndex !== null && (
        <FavoritesLightbox
          images={sortedFaves}
          startIndex={lightboxIndex}
          authToken={authToken}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

// ── Client Favorites Section ──────────────────────────────────────────────────
function ClientFavoritesSection({ galleryId, authToken, totalImages }) {
  const [viewerFavorites, setViewerFavorites] = useState([])
  const [loading, setLoading] = useState(true)
  const [openViewer, setOpenViewer] = useState(null)

  useEffect(() => {
    loadFavorites()
  }, [galleryId])

  async function loadFavorites() {
    const { data } = await supabase
      .from('gallery_favorites')
      .select(`
        id, image_id, viewer_id, created_at,
        gallery_viewers ( id, email, display_name ),
        gallery_images ( id, file_name, preview_r2_key )
      `)
      .eq('gallery_id', galleryId)
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    const byViewer = new Map()
    for (const fav of data) {
      const v = fav.gallery_viewers
      if (!v) continue
      if (!byViewer.has(v.id)) byViewer.set(v.id, { viewer: v, favorites: [] })
      if (fav.gallery_images) {
        byViewer.get(v.id).favorites.push({
          id: fav.id,
          created_at: fav.created_at,
          ...fav.gallery_images,
        })
      }
    }

    setViewerFavorites([...byViewer.values()])
    setLoading(false)
  }

  function handleDeleted(viewerId) {
    setViewerFavorites(prev => prev.filter(vf => vf.viewer.id !== viewerId))
    setOpenViewer(null)
  }

  if (loading || viewerFavorites.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client favorites</h2>
      <div className="space-y-2">
        {viewerFavorites.map(({ viewer, favorites }) => {
          const lastUpdated = favorites[0]?.created_at
          const color = avatarColor(viewer.email || viewer.display_name)
          return (
            <button key={viewer.id}
              onClick={() => setOpenViewer({ viewer, favorites })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                style={{ background: color.bg, color: color.color }}>
                {initials(viewer.email || viewer.display_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {viewer.email || viewer.display_name || 'Unknown'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {favorites.length} image{favorites.length !== 1 ? 's' : ''}
                  {lastUpdated && ` · Updated ${formatDateTime(lastUpdated)}`}
                </p>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {openViewer && (
        <ClientFavoritesPanel
          viewer={openViewer.viewer}
          favorites={openViewer.favorites}
          authToken={authToken}
          totalImages={totalImages}
          galleryId={galleryId}
          onClose={() => setOpenViewer(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GalleryActivity() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [gallery, setGallery] = useState(null)
  const [folderAncestors, setFolderAncestors] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [authToken, setAuthToken] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      setLoading(true)
      const [{ data: { session } }, { data: g }, { data: logs }, { data: replies }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('galleries')
          .select('id, title, folder_id, image_count:gallery_images!gallery_images_gallery_id_fkey(count)')
          .eq('id', id).single(),
        supabase
          .from('gallery_activity_log')
          .select(`
            id, action, occurred_at, image_id, viewer_id, metadata,
            gallery_viewers (email, display_name),
            gallery_images (file_name, preview_r2_key)
          `)
          .eq('gallery_id', id)
          .order('occurred_at', { ascending: false })
          .limit(200),
        // Photographer replies live in gallery_comments, not
        // gallery_activity_log -- that table has no concept of a
        // photographer action at all (no photographer_id column, no
        // authenticated INSERT policy), and retrofitting it would mean a
        // real schema change. Reading replies directly from
        // gallery_comments (RLS: 031_gallery_comments_photographer_select.sql)
        // and merging them into the same list is simpler and means replies
        // persist properly -- no synthetic client-only rows.
        supabase
          .from('gallery_comments')
          .select('id, body, created_at, image_id, gallery_images (file_name, preview_r2_key)')
          .eq('gallery_id', id)
          .not('photographer_id', 'is', null)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      setAuthToken(session?.access_token || null)
      setGallery(g)

      const replyEntries = (replies || []).map(r => ({
        id: `reply-${r.id}`,
        action: 'reply',
        occurred_at: r.created_at,
        image_id: r.image_id,
        viewer_id: null,
        metadata: { comment_body: r.body },
        gallery_viewers: null,
        gallery_images: r.gallery_images || null,
      }))
      const mergedLogs = [...(logs || []), ...replyEntries]
        .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      // Folder context: prefer what GalleryDetail relayed via navigation
      // state, otherwise fetch fresh from the gallery's folder_id. Fetching
      // as a fallback keeps the breadcrumb correct even on a direct link
      // or hard refresh to this page.
      if (location.state?.folderAncestors) {
        setFolderAncestors(location.state.folderAncestors)
      } else if (g?.folder_id !== undefined) {
        getFolderAncestors(g.folder_id).then(setFolderAncestors).catch(() => setFolderAncestors([]))
      }
      setActivity(mergedLogs.map(log => ({
        ...log,
        comment_body: log.metadata?.comment_body || null
      })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleReply(log) {
    if (!replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      await addPhotographerReply(id, log.image_id || null, replyText.trim())
      setReplyText('')
      setReplyingTo(null)
      // Refetch through the real load() path rather than splicing a local
      // object into state -- this guarantees what's shown immediately
      // after sending matches exactly what a reload would show, since
      // it's the same query either way. Replies are persisted for real in
      // gallery_comments, so this isn't just a client-side illusion.
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setSendingReply(false)
    }
  }

  const filtered = filter === 'all'
    ? activity
    : activity.filter(a => a.action === filter || (filter === 'download' && a.action.startsWith('download')))

  const stats = {
    views: activity.filter(a => a.action === 'view').length,
    favorites: activity.filter(a => a.action === 'favorite').length,
    downloads: activity.filter(a => a.action.startsWith('download')).length,
    uniqueViewers: new Set(activity.map(a => a.gallery_viewers?.email ? a.gallery_viewers.email : a.gallery_viewers?.display_name).filter(Boolean)).size,
  }

  const totalImages = gallery?.image_count?.[0]?.count ?? null

  return (
    <div className="max-w-3xl space-y-5">
      <PageBreadcrumb crumbs={gallery ? buildGalleryCrumbs(gallery, folderAncestors, 'Activity') : [{ label: 'Galleries', to: '/' }, { label: 'Activity' }]} />

      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Activity</h1>
        {gallery && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{gallery.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Total Views',     value: stats.views },
          { label: 'Unique Visitors', value: stats.uniqueViewers },
          { label: 'Favorites',       value: stats.favorites },
          { label: 'Downloads',       value: stats.downloads },
        ].map(s => (
          <div key={s.label} className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {!loading && authToken && (
        <ClientFavoritesSection
          galleryId={id}
          authToken={authToken}
          totalImages={totalImages}
        />
      )}

      {!loading && <div style={{ borderTop: '1px solid var(--border)' }} />}

      <div className="md:hidden">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px',
            fontWeight: '500', outline: 'none', cursor: 'pointer', appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: '36px',
          }}>
          {[
            { id: 'all',      label: 'All Activity' },
            { id: 'view',     label: 'Views' },
            { id: 'favorite', label: 'Favorites' },
            { id: 'download', label: 'Downloads' },
            { id: 'comment',  label: 'Comments' },
          ].map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: filter === f.id ? '#6366f1' : 'var(--surface)',
              color: filter === f.id ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === f.id ? '#6366f1' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(log => {
            const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.view
            const Icon = cfg.icon
            const name = log.gallery_viewers?.email || log.gallery_viewers?.display_name || 'Someone'
            const fileName = log.gallery_images?.file_name
            const previewKey = log.gallery_images?.preview_r2_key
            return (
              <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--surface)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cfg.color}18` }}>
                  <Icon size={13} style={{ color: cfg.color }} />
                </div>
                {previewKey && authToken && (
                  <img
                    src={`${WORKER_URL}/preview/${encodeURIComponent(previewKey)}?token=${authToken}`}
                    alt={fileName}
                    className="w-7 h-7 rounded object-cover flex-shrink-0"
                    style={{ objectFit: 'cover' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text)' }}>
                    {log.action === 'reply'
                      ? cfg.label
                      : <><span className="font-medium">{name}</span>{' '}{cfg.label.toLowerCase()}</>}
                  </p>
                  {fileName && (
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{fileName}</p>
                  )}
                  {log.comment_body && (
                    <p className="text-xs italic truncate" style={{ color: 'var(--text-muted)' }}>
                      "{log.comment_body}"
                    </p>
                  )}
                  {log.action === 'comment' && replyingTo === log.id && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <input
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleReply(log)}
                        placeholder="Write a reply…"
                        autoFocus
                        className="flex-1 text-xs rounded-lg px-2 py-1.5"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                      />
                      <button
                        onClick={() => handleReply(log)}
                        disabled={!replyText.trim() || sendingReply}
                        className="text-xs font-medium px-2 py-1.5 rounded-lg flex-shrink-0 enabled:hover:brightness-90 transition-[filter]"
                        style={{ background: '#6366f1', color: 'white', opacity: (!replyText.trim() || sendingReply) ? 0.5 : 1 }}
                      >
                        Send
                      </button>
                    </div>
                  )}
                </div>
                {log.action === 'comment' && (
                  <button
                    onClick={() => { setReplyingTo(replyingTo === log.id ? null : log.id); setReplyText('') }}
                    className="text-xs font-medium flex-shrink-0 px-2 py-1 rounded-lg hover:opacity-70 transition-opacity"
                    style={{ color: '#6366f1' }}
                  >
                    {replyingTo === log.id ? 'Cancel' : 'Reply'}
                  </button>
                )}
                <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {timeAgo(log.occurred_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
