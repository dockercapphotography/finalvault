import BottomSheet from './BottomSheet.jsx'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import { useState, useEffect, useRef } from 'react'
import { Bell, Eye, Download, Package, Heart, HeartOff, MessageCircle } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { formatDate } from '../../utils/formatters.js'

const ACTION_CONFIG = {
  view:            { Icon: Eye,           color: '#6366f1', bg: '#6366f115' },
  download_single: { Icon: Download,      color: '#0ea5e9', bg: '#0ea5e915' },
  download_all:    { Icon: Package,       color: '#0ea5e9', bg: '#0ea5e915' },
  favorite:        { Icon: Heart,         color: '#f43f5e', bg: '#f43f5e15' },
  unfavorite:      { Icon: HeartOff,      color: '#94a3b8', bg: '#94a3b815' },
  comment:         { Icon: MessageCircle, color: '#10b981', bg: '#10b98115' },
}

function getActionLabel(item) {
  switch (item.action) {
    case 'view':            return 'viewed the gallery'
    case 'download_single': return item.fileName ? `downloaded "${item.fileName}"` : 'downloaded an image'
    case 'download_all':    return item.metadata?.count ? `downloaded ${item.metadata.count} images` : 'downloaded all images'
    case 'favorite':        return 'favorited an image'
    case 'unfavorite':      return 'unfavorited an image'
    case 'comment':         return 'left a comment'
    default:                return item.action
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function groupByDay(items) {
  const groups = {}
  const now = new Date()
  items.forEach(item => {
    const d = new Date(item.occurred_at)
    const diffDays = Math.floor((now - d) / 86400000)
    const key = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : formatDate(item.occurred_at)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  })
  return groups
}

export default function NotificationBell({ mobile = false }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastRead, setLastRead] = useState(null)
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)


  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadLastRead(user.id).then(ts => loadActivity(user.id, ts))
    })
  }, [])

  // Listen for the global "notifications read" event fired by the other bell instance
  useEffect(() => {
    function handleNotificationsRead() {
      setUnreadCount(0)
      setLastRead(new Date().toISOString())
    }
    window.addEventListener('fv-notifications-read', handleNotificationsRead)
    return () => window.removeEventListener('fv-notifications-read', handleNotificationsRead)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function loadLastRead(uid) {
    const { data } = await supabase
      .from('photographers')
      .select('notifications_last_read_at')
      .eq('id', uid)
      .single()
    const ts = data?.notifications_last_read_at || null
    setLastRead(ts)
    return ts
  }

  async function loadActivity(uid, knownLastRead) {
    setLoading(true)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: galleries } = await supabase
      .from('galleries')
      .select('id, title')
      .eq('photographer_id', uid)

    if (!galleries?.length) { setLoading(false); return }

    const galleryIds = galleries.map(g => g.id)
    const galleryMap = Object.fromEntries(galleries.map(g => [g.id, g.title]))

    const { data: logs } = await supabase
      .from('gallery_activity_log')
      .select(`
        id, gallery_id, action, occurred_at, metadata, image_id,
        gallery_viewers (email, display_name)
      `)
      .in('gallery_id', galleryIds)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(100)

    if (!logs) { setLoading(false); return }

    const imageIds = [...new Set(logs.filter(l => l.image_id).map(l => l.image_id))]
    let fileNameMap = {}
    if (imageIds.length) {
      const { data: imgs } = await supabase
        .from('gallery_images')
        .select('id, file_name')
        .in('id', imageIds)
      if (imgs) fileNameMap = Object.fromEntries(imgs.map(i => [i.id, i.file_name]))
    }

    const enriched = logs.map(log => ({
      ...log,
      galleryTitle: galleryMap[log.gallery_id] || 'Unknown gallery',
      viewerName: log.gallery_viewers?.email ? log.gallery_viewers.email : log.gallery_viewers?.display_name || 'Someone',
      fileName: log.image_id ? fileNameMap[log.image_id] : null,
    }))

    setItems(enriched)

    if (knownLastRead) {
      setUnreadCount(enriched.filter(i => new Date(i.occurred_at) > new Date(knownLastRead)).length)
    } else {
      setUnreadCount(enriched.length)
    }

    setLoading(false)
  }

  async function handleOpen() {
    setOpen(prev => !prev)
    if (!open && userId) {
      const now = new Date().toISOString()
      await supabase
        .from('photographers')
        .update({ notifications_last_read_at: now })
        .eq('id', userId)
      setLastRead(now)
      setUnreadCount(0)
      // Notify the other bell instance (desktop ↔ mobile) to also clear its badge
      window.dispatchEvent(new CustomEvent('fv-notifications-read'))
    }
  }

  useScrollLock(open && mobile)

  const groups = groupByDay(items)

  if (mobile) {
    return (
      <div className="flex-1 h-full">
        <button onClick={handleOpen}
          className="flex flex-col items-center justify-center gap-1 w-full h-full text-xs transition-colors"
          style={{ color: open ? 'var(--text)' : 'var(--text-muted)', fontWeight: open ? '500' : '400', background: 'none', border: 'none', cursor: 'pointer' }}>
          <div className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center"
                style={{ background: '#6366f1', fontSize: 9, fontWeight: 700 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          Alerts
        </button>


        <BottomSheet open={open} onClose={() => setOpen(false)} maxHeight="75vh">
          <NotificationPanel groups={groups} loading={loading} items={items} onClose={() => setOpen(false)} />
        </BottomSheet>
      </div>
    )
  }

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={handleOpen}
        className="relative p-1 rounded-lg transition-colors"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center"
            style={{ background: '#6366f1', fontSize: 9, fontWeight: 700 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 320, maxHeight: '70vh' }}>
          <NotificationPanel groups={groups} loading={loading} items={items} />
        </div>
      )}
    </div>
  )
}

function NotificationPanel({ groups, loading, items, onClose }) {
  return (
    <div className="flex flex-col" style={{ maxHeight: '70vh' }}>
      <div className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Activity</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last 7 days</span>
          {onClose && (
            <button onClick={onClose}
              className="text-xs px-2.5 py-1 rounded-lg font-medium"
              style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No activity in the last 7 days</p>
          </div>
        )}

        {!loading && Object.entries(groups).map(([day, dayItems]) => (
          <div key={day}>
            <div className="px-4 py-2 text-xs font-semibold sticky top-0"
              style={{ color: 'var(--text-muted)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {day}
            </div>
            {dayItems.map(item => {
              const action = ACTION_CONFIG[item.action] || { Icon: Bell, color: 'var(--text-muted)', bg: 'var(--surface-raised)' }
              return (
                <div key={item.id} className="px-4 py-3 flex items-start gap-3"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: action.bg }}>
                    <action.Icon size={14} style={{ color: action.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'var(--text)' }}>
                      <span className="font-medium">{item.viewerName}</span>
                      {' '}{getActionLabel(item)}
                    </p>
                    {item.metadata?.comment_body && (
                      <p className="text-xs mt-0.5 italic truncate" style={{ color: 'var(--text-muted)' }}>
                        "{item.metadata.comment_body}"
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {item.galleryTitle} · {timeAgo(item.occurred_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
