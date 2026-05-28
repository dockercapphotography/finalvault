import { useNavigate } from 'react-router-dom'
import { Images, Lock, Clock } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import { formatDate } from '../../utils/formatters.js'

export default function GalleryCard({ gallery, onCopyLink }) {
  const navigate = useNavigate()

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive' : isExpired ? 'expired' : 'active'
  const statusBadge = {
    active:   <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired:  <Badge variant="danger">Expired</Badge>,
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
        <Images size={28} style={{ color: 'var(--text-muted)' }} />
        <div className="absolute top-3 left-3">{statusBadge[status]}</div>
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
          <p className="text-xs mb-3 truncate" style={{ color: 'var(--text-muted)' }}>
            {gallery.client_name}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatDate(gallery.created_at)}
          </span>
          {gallery.expires_at && !isExpired && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--warning)' }}>
              <Clock size={11} />
              {formatDate(gallery.expires_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
