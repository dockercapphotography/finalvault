import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Images, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'
import ClientPortalFilterSheet from '../components/layout/ClientPortalFilterSheet.jsx'

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

// Lightweight desktop equivalent of the mobile bottom sheet -- a bottom
// sheet sliding up from the screen edge isn't a desktop pattern, so this
// is a small anchored dropdown panel instead, with the same three
// controls (Event date / Show / Sort) as plain selects rather than a
// drill-down flow, since there's room to show them all at once without
// the mobile-width constraint that motivated drill-down sub-screens.
function DesktopFilterPanel({ eventDate, setEventDate, show, setShow, sort, setSort }) {
  const selectStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', cursor: 'pointer',
  }

  return (
    <div className="absolute right-0 top-full mt-2 rounded-xl shadow-lg z-30 p-3 space-y-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 220 }}>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Event date</label>
        <select
          value={eventDate.type === 'preset' ? eventDate.value : 'custom'}
          onChange={e => {
            const v = e.target.value
            setEventDate(v === 'custom' ? { type: 'range', from: null, to: null } : { type: 'preset', value: v })
          }}
          style={selectStyle}>
          <option value="all">All time</option>
          <option value="last_month">Last month</option>
          <option value="last_3_months">Last 3 months</option>
          <option value="last_6_months">Last 6 months</option>
          <option value="last_year">Last year</option>
          <option value="last_2_years">Last 2 years</option>
          <option value="custom">Custom range...</option>
        </select>
        {eventDate.type === 'range' && (
          <div className="space-y-1.5 mt-2">
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>From</label>
              <input type="date" value={eventDate.from || ''}
                onChange={e => setEventDate(prev => ({ ...prev, from: e.target.value || null }))}
                style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>To</label>
              <input type="date" value={eventDate.to || ''}
                onChange={e => setEventDate(prev => ({ ...prev, to: e.target.value || null }))}
                style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }} />
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Show</label>
        <select value={show} onChange={e => setShow(e.target.value)} style={selectStyle}>
          <option value="all">Any</option>
          <option value="active">Active only</option>
          <option value="expired">Expired only</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Sort by</label>
        <select value={sort} onChange={e => setSort(e.target.value)} style={selectStyle}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
    </div>
  )
}

function matchesEventDateFilter(dateStr, filter) {
  if (filter.type === 'preset') {
    if (filter.value === 'all') return true
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()
    const ms = 86400000
    if (filter.value === 'last_month') return d >= new Date(now - 30 * ms)
    if (filter.value === 'last_3_months') return d >= new Date(now - 91 * ms)
    if (filter.value === 'last_6_months') return d >= new Date(now - 182 * ms)
    if (filter.value === 'last_year') return d >= new Date(now - 365 * ms)
    if (filter.value === 'last_2_years') return d >= new Date(now - 730 * ms)
    return true
  }
  // type === 'range'
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (filter.from && d < new Date(filter.from)) return false
  if (filter.to && d > new Date(filter.to)) return false
  return true
}

function isEventDateFilterActive(filter) {
  if (filter.type === 'preset') return filter.value !== 'all'
  return !!(filter.from || filter.to)
}

function eventDateFilterLabel(filter) {
  if (filter.type === 'preset') {
    const labels = { all: 'All time', last_month: 'Last month', last_3_months: 'Last 3 months', last_6_months: 'Last 6 months', last_year: 'Last year', last_2_years: 'Last 2 years' }
    return labels[filter.value] || 'All time'
  }
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const from = fmt(filter.from)
  const to = fmt(filter.to)
  if (from && to) return `${from} – ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return 'Custom range'
}

export default function ClientPortalGalleries() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [eventDate, setEventDate] = useState({ type: 'preset', value: 'all' })
  const [show, setShow] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false)
  const desktopPanelRef = useRef(null)

  useEffect(() => {
    if (!desktopPanelOpen) return
    function handler(e) {
      if (!desktopPanelRef.current?.contains(e.target)) setDesktopPanelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [desktopPanelOpen])

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

  const allGalleries = data.galleries || []

  const filtered = allGalleries.filter(g => {
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const matchesText = g.title?.toLowerCase().includes(q) || g.event_name?.toLowerCase().includes(q)
      if (!matchesText) return false
    }
    if (!matchesEventDateFilter(g.event_date, eventDate)) return false
    const isExpired = !g.is_active || (g.expires_at && new Date(g.expires_at) < new Date())
    if (show === 'active' && isExpired) return false
    if (show === 'expired' && !isExpired) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
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

  const hasActiveFilters = isEventDateFilterActive(eventDate) || show !== 'all'

  return (
    <ClientPortalLayout
      token={token}
      photographerId={data.client?.photographer_id}
      pendingContracts={(data.contracts || []).filter(c => c.status !== 'signed').length}
      pendingQuestionnaires={(data.pending_questionnaires || []).length}
    >
      <div className="space-y-4" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Galleries</h1>

          {/* Mobile: opens the bottom sheet */}
          {allGalleries.length > 1 && (
            <button onClick={() => setSheetOpen(true)}
              className="md:hidden flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
              style={{
                background: hasActiveFilters ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
                border: `1px solid ${hasActiveFilters ? '#6366f1' : 'var(--border)'}`,
                color: hasActiveFilters ? '#6366f1' : 'var(--text)', cursor: 'pointer',
              }}>
              <SlidersHorizontal size={13} />Filters &amp; sort
            </button>
          )}

          {/* Desktop: opens the anchored dropdown panel */}
          {allGalleries.length > 1 && (
            <div className="hidden md:block relative" ref={desktopPanelRef}>
              <button onClick={() => setDesktopPanelOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
                style={{
                  background: hasActiveFilters ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
                  border: `1px solid ${hasActiveFilters ? '#6366f1' : 'var(--border)'}`,
                  color: hasActiveFilters ? '#6366f1' : 'var(--text)', cursor: 'pointer',
                }}>
                <SlidersHorizontal size={13} />Filters &amp; sort
              </button>
              {desktopPanelOpen && (
                <DesktopFilterPanel
                  eventDate={eventDate} setEventDate={setEventDate}
                  show={show} setShow={setShow}
                  sort={sort} setSort={setSort}
                />
              )}
            </div>
          )}
        </div>

        {allGalleries.length > 4 && (
          <div className="relative">
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search galleries..."
              className="w-full text-sm rounded-lg outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px 8px 34px' }}
            />
          </div>
        )}

        {allGalleries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Images size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Nothing here yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Galleries will show up here once they're ready.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No matches</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Try adjusting your search or filters.
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

      <ClientPortalFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        eventDate={eventDate} setEventDate={setEventDate}
        show={show} setShow={setShow}
        sort={sort} setSort={setSort}
      />
    </ClientPortalLayout>
  )
}
