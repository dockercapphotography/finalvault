import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, Heart, HeartOff, MessageCircle, Download, Package } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { formatDate } from '../utils/formatters.js'

const ACTION_CONFIG = {
  view:            { icon: Eye,          label: 'Viewed gallery',        color: '#6366f1' },
  favorite:        { icon: Heart,        label: 'Favorited a photo',     color: '#ef4444' },
  unfavorite:      { icon: HeartOff,     label: 'Unfavorited a photo',   color: '#9ca3af' },
  comment:         { icon: MessageCircle,label: 'Left a comment',        color: '#f59e0b' },
  download_single: { icon: Download,     label: 'Downloaded a photo',    color: '#10b981' },
  download_all:    { icon: Package,      label: 'Downloaded all photos', color: '#10b981' },
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

export default function GalleryActivity() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [gallery, setGallery] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      setLoading(true)
      const [{ data: g }, { data: logs }] = await Promise.all([
        supabase.from('galleries').select('id, title').eq('id', id).single(),
        supabase
          .from('gallery_activity_log')
          .select(`
            id, action, occurred_at, image_id, viewer_id, metadata,
            gallery_viewers (display_name),
            gallery_images (file_name, preview_r2_key)
          `)
          .eq('gallery_id', id)
          .order('occurred_at', { ascending: false })
          .limit(200)
      ])
      setGallery(g)
      setActivity((logs || []).map(log => ({
        ...log,
        comment_body: log.metadata?.comment_body || null
      })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all'
    ? activity
    : activity.filter(a => a.action === filter || (filter === 'download' && a.action.startsWith('download')))

  // Stats
  const stats = {
    views: activity.filter(a => a.action === 'view').length,
    favorites: activity.filter(a => a.action === 'favorite').length,
    downloads: activity.filter(a => a.action.startsWith('download')).length,
    comments: activity.filter(a => a.action === 'comment').length,
    uniqueViewers: new Set(activity.map(a => a.gallery_viewers?.display_name).filter(Boolean)).size,
  }

  const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={() => navigate(`/galleries/${id}`)}
        className="flex items-center gap-1.5 text-sm -ml-1"
        style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
        <ArrowLeft size={15} /> Back to gallery
      </button>

      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Activity</h1>
        {gallery && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{gallery.title}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Views', value: stats.views },
          { label: 'Unique Visitors', value: stats.uniqueViewers },
          { label: 'Favorites', value: stats.favorites },
          { label: 'Downloads', value: stats.downloads },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'all', label: 'All' },
          { id: 'view', label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment', label: 'Comments' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
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

      {/* Activity list */}
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
            const name = log.gallery_viewers?.display_name || 'Someone'
            const fileName = log.gallery_images?.file_name
            const previewKey = log.gallery_images?.preview_r2_key

            return (
              <div key={log.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl"
                style={{ background: 'var(--surface)' }}>
                {/* Icon */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cfg.color}18` }}>
                  <Icon size={14} style={{ color: cfg.color }} />
                </div>

                {/* Thumbnail */}
                {previewKey && (
                  <img
                    src={`${WORKER_URL}/preview/${encodeURIComponent(previewKey)}`}
                    alt={fileName}
                    className="w-8 h-8 rounded object-cover flex-shrink-0"
                    style={{ objectFit: 'cover' }}
                  />
                )}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text)' }}>
                      <span className="font-medium">{name}</span>
                      {' '}{cfg.label.toLowerCase()}
                      {fileName && <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>— {fileName}</span>}
                    </p>
                    {log.comment_body && (
                      <p className="text-xs mt-0.5 italic" style={{ color: 'var(--text-muted)' }}>
                        "{log.comment_body}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Time */}
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
