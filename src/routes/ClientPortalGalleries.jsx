import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Images, ChevronRight } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function GalleryRow({ gallery, isNew }) {
  const isExpired = !gallery.is_active || (gallery.expires_at && new Date(gallery.expires_at) < new Date())
  return (
    <a
      href={`/g/${gallery.share_token}`}
      className="flex items-center rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border)', textDecoration: 'none',
        opacity: isExpired ? 0.55 : 1,
        pointerEvents: isExpired ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'relative', width: 76, height: 76, background: 'var(--surface-raised)', overflow: 'hidden', flexShrink: 0 }}>
        {gallery.cover_r2_key && (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}?share_token=${gallery.share_token}${isExpired ? '&allow_expired=1' : ''}`}
            alt=""
            style={{
              display: 'block', width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`,
              filter: isExpired ? 'grayscale(1) brightness(0.85)' : 'none',
            }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}
        {isNew && !isExpired && (
          <span style={{
            position: 'absolute', top: 4, right: 4, background: '#6366f1', color: '#fff',
            fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 7,
          }}>
            New
          </span>
        )}
      </div>
      <div className="px-4 py-3 flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isExpired ? 'Expired' : gallery.event_date
            ? new Date(gallery.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : ''}
        </p>
      </div>
      {!isExpired && <ChevronRight size={16} style={{ color: '#c4c4c4', marginRight: 16, flexShrink: 0 }} />}
    </a>
  )
}

export default function ClientPortalGalleries() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sort, setSort] = useState('newest')

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    setLoading(true)
    setNotFound(false)
    try {
      const result = await getPortalData(token)
      if (!result) {
        setNotFound(true)
        return
      }
      setData(result)
      // "New" badge comes straight from the RPC's per-gallery `viewed`
      // field (computed server-side against gallery_viewers), rather than
      // a frontend cross-check -- see docs/CLIENT_PORTAL_SPEC.md for why
      // that logic lives in the RPC instead of a direct anon table read.
      // Branding is now fetched once in ClientPortalLayout, not per-page.
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <ClientPortalLayout token={token} pendingContracts={0} pendingQuestionnaires={0}>
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      </ClientPortalLayout>
    )
  }

  const galleries = data.galleries || []
  const sorted = [...galleries].sort((a, b) => {
    const ad = a.event_date ? new Date(a.event_date) : null
    const bd = b.event_date ? new Date(b.event_date) : null
    if (!ad && !bd) return 0
    if (!ad) return 1
    if (!bd) return -1
    return sort === 'newest' ? bd - ad : ad - bd
  })

  // Group by session_name, with a "General" bucket for direct-only links.
  const groups = []
  const groupIndex = {}
  for (const g of sorted) {
    const key = g.session_name || 'General'
    if (!(key in groupIndex)) {
      groupIndex[key] = groups.length
      groups.push({ label: key, galleries: [] })
    }
    groups[groupIndex[key]].galleries.push(g)
  }

  return (
    <ClientPortalLayout
      token={token}
      photographerId={data.client?.photographer_id}
      pendingContracts={(data.contracts || []).filter(c => c.status !== 'signed').length}
      pendingQuestionnaires={(data.pending_questionnaires || []).length}
    >
      <div className="space-y-5" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Welcome back</p>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Hi, {data.client?.first_name}
            </h1>
          </div>
          {galleries.length > 1 && (
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          )}
        </div>

        {galleries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Images size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Nothing here yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Galleries will show up here once they're ready.
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>{group.label}</p>
              <div className="space-y-2">
                {group.galleries.map(g => (
                  <GalleryRow key={g.id} gallery={g} isNew={!g.viewed} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </ClientPortalLayout>
  )
}
