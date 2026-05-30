import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Images, Lock, Clock, Bookmark } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import { formatDate } from '../../utils/formatters.js'
import { bookmarkGallery, unbookmarkGallery } from '../../utils/bookmarkApi.js'

export default function GalleryCard({ gallery, coverUrl, onCopyLink, isBookmarked: initialBookmarked = false }) {
  const navigate = useNavigate()
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [bookmarking, setBookmarking] = useState(false)

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive' : isExpired ? 'expired' : 'active'
  const statusBadge = {
    active:   <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired:  <Badge variant="danger">Expired</Badge>,
  }

  const metaLine = [
    gallery.event_name,
    gallery.event_date && formatDate(gallery.event_date),
  ].filter(Boolean).join(' · ')

  async function handleBookmark(e) {
    e.stopPropagation()
    if (bookmarking) return
    setBookmarking(true)
    try {
      if (bookmarked) {
        await unbookmarkGallery(gallery.id)
        setBookmarked(false)
      } else {
        await bookmarkGallery(gallery.id)
        setBookmarked(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setBookmarking(false)
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      onClick={() => navigate(`/galleries/${gallery.id}`)}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Cover */}
      <div className="aspect-[4/3] relative overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--surface-raised)' }}>
        {coverUrl ? (
          <img src={coverUrl} alt={gallery.title} className="w-full h-full" style={{ objectFit: 'cover' }} />
        ) : (
          <Images size={28} style={{ color: 'var(--text-muted)' }} />
        )}
        <div className="absolute top-3 left-3">{statusBadge[status]}</div>

        {/* Bookmark button */}
        <button
          onClick={handleBookmark}
          className="absolute bottom-3 right-3 p-1.5 rounded-full transition-all"
          style={{
            background: bookmarked ? '#6366f1' : 'rgba(0,0,0,0.45)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            opacity: bookmarking ? 0.6 : 1,
          }}>
          <Bookmark size={13} fill={bookmarked ? '#fff' : 'none'} />
        </button>

        {gallery.require_password && (
          <div className="absolute top-3 right-3 p-1.5 rounded-full" style={{ background: 'var(--surface)' }}>
            <Lock size={11} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-medium text-sm truncate mb-0.5" style={{ color: 'var(--text)' }}>
          {gallery.title}
        </h3>
        {gallery.client_name && (
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            {gallery.client_name}
          </p>
        )}
        {metaLine && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {metaLine}
          </p>
        )}
        {!metaLine && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {formatDate(gallery.created_at)}
          </p>
        )}
        {gallery.expires_at && !isExpired && (
          <span className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--warning)' }}>
            <Clock size={11} />
            Expires {formatDate(gallery.expires_at)}
          </span>
        )}
      </div>
    </div>
  )
}
