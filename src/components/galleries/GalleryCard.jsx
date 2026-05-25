import { useNavigate } from 'react-router-dom'
import { Images, Lock, Clock, ExternalLink } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import { formatDate } from '../../utils/formatters.js'

export default function GalleryCard({ gallery, onCopyLink }) {
  const navigate = useNavigate()

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive'
    : isExpired ? 'expired'
    : 'active'

  const statusBadge = {
    active: <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired: <Badge variant="danger">Expired</Badge>,
  }

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors cursor-pointer group"
      onClick={() => navigate(`/galleries/${gallery.id}`)}
    >
      {/* Cover image or placeholder */}
      <div className="aspect-[4/3] bg-slate-800 relative overflow-hidden">
        {gallery.gallery_images?.preview_r2_key ? (
          <div className="w-full h-full bg-slate-700 flex items-center justify-center">
            <Images size={32} className="text-slate-600" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Images size={32} className="text-slate-700" />
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-3 left-3">
          {statusBadge[status]}
        </div>

        {/* Lock indicator */}
        {gallery.require_password && (
          <div className="absolute top-3 right-3 bg-slate-900/80 rounded-full p-1.5">
            <Lock size={12} className="text-slate-400" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4">
        <h3 className="text-white font-semibold text-sm truncate mb-0.5">{gallery.title}</h3>
        {gallery.client_name && (
          <p className="text-slate-500 text-xs mb-3 truncate">{gallery.client_name}</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-slate-600 text-xs">{formatDate(gallery.created_at)}</span>

          {gallery.expires_at && !isExpired && (
            <span className="flex items-center gap-1 text-xs text-amber-500">
              <Clock size={11} />
              Expires {formatDate(gallery.expires_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
