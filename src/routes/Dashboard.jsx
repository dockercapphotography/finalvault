import { useState, useEffect, useRef } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, ChevronDown, X, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { getGalleries } from '../utils/galleryApi.js'
import { getBookmarkedGalleryIds } from '../utils/bookmarkApi.js'
import GalleryGrid from '../components/galleries/GalleryGrid.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Calendar range picker ─────────────────────────────────────────────────────

function CalendarRangePicker({ value, onChange }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [hovering, setHovering] = useState(null)
  const [picker, setPicker] = useState(null) // null | 'month' | 'year'

  const from = value?.from || null
  const to = value?.to || null

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  function startOfDay(d) { const c = new Date(d); c.setHours(0,0,0,0); return c }

  function handleDayClick(date) {
    if (!from || (from && to)) onChange({ from: startOfDay(date), to: null })
    else if (date < from) onChange({ from: startOfDay(date), to: startOfDay(from) })
    else onChange({ from, to: startOfDay(date) })
  }

  function isInRange(date) {
    if (!from) return false
    const end = to || hovering
    if (!end) return false
    const lo = from < end ? from : end
    const hi = from < end ? end : from
    return date > lo && date < hi
  }

  function isSelected(date) {
    if (from && date.toDateString() === from.toDateString()) return true
    if (to && date.toDateString() === to.toDateString()) return true
    return false
  }

  // Build grid with faded prev/next month days
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = viewMonth === 0 ? 11 : viewMonth - 1
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ date: new Date(py, pm, daysInPrevMonth - i), faded: true })
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(viewYear, viewMonth, d), faded: false })
  // Always fill to exactly 6 rows (42 cells) so height stays consistent
  const totalCells = 42
  let nextD = 1
  while (cells.length < totalCells) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({ date: new Date(ny, nm, nextD++), faded: true })
  }

  return (
    <div style={{ width: 300 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setPicker(p => p === 'month' ? null : 'month')}
            className="text-sm font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: picker === 'month' ? 'rgba(99,102,241,0.1)' : 'transparent', color: picker === 'month' ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}>
            {MONTHS[viewMonth]}
          </button>
          <button onClick={() => setPicker(p => p === 'year' ? null : 'year')}
            className="text-sm font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: picker === 'year' ? 'rgba(99,102,241,0.1)' : 'transparent', color: picker === 'year' ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}>
            {viewYear}
          </button>
        </div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Month picker */}
      {picker === 'month' && (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => { setViewMonth(i); setPicker(null) }}
              className="py-2 rounded-lg text-sm font-medium"
              style={{ background: i === viewMonth ? '#6366f1' : 'transparent', color: i === viewMonth ? '#fff' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (i !== viewMonth) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (i !== viewMonth) e.currentTarget.style.background = 'transparent' }}>
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {/* Year picker */}
      {picker === 'year' && (
        <div className="grid grid-cols-3 gap-1 overflow-y-auto" style={{ maxHeight: 220 }}>
          {Array.from({ length: 20 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
            <button key={y} onClick={() => { setViewYear(y); setPicker(null) }}
              className="py-2 rounded-lg text-sm font-medium"
              style={{ background: y === viewYear ? '#6366f1' : 'transparent', color: y === viewYear ? '#fff' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (y !== viewYear) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (y !== viewYear) e.currentTarget.style.background = 'transparent' }}>
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Day grid — only when not in month/year picker */}
      {picker === null && (
        <>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d, i) => (
              <div key={i} className="text-center text-xs font-medium py-2" style={{ color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map(({ date, faded }, i) => {
              const sel = isSelected(date)
              const inRange = isInRange(date)
              const isToday = date.toDateString() === today.toDateString()
              return (
                <button key={i}
                  onClick={() => !faded && handleDayClick(date)}
                  onMouseEnter={() => { if (!faded && from && !to) setHovering(date) }}
                  onMouseLeave={() => setHovering(null)}
                  style={{
                    background: sel ? '#6366f1' : inRange ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: sel ? '#fff' : isToday ? '#6366f1' : 'var(--text)',
                    opacity: faded ? 0.25 : 1,
                    border: 'none',
                    borderRadius: 6,
                    cursor: faded ? 'default' : 'pointer',
                    padding: '10px 0',
                    fontSize: 12,
                    fontWeight: sel || isToday ? '600' : '400',
                  }}>
                  {date.getDate()}
                </button>
              )
            })}
          </div>
          {(from || to) && (
            <button onClick={() => onChange({ from: null, to: null })}
              className="w-full text-xs mt-3 py-1.5 rounded-lg"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-raised)', border: 'none', cursor: 'pointer' }}>
              Clear dates
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Date filter panel (calendar + presets) ────────────────────────────────────

function DateFilterPanel({ value, onChange, presets }) {
  return (
    <div className="flex gap-4 p-4" style={{ minWidth: 500 }}>
      <CalendarRangePicker
        value={value?.range || { from: null, to: null }}
        onChange={range => onChange({ type: 'range', range })}
      />
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ minWidth: 140, maxHeight: 300 }}>
        <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Quick Search</p>
        {presets.map(p => {
          const active = value?.type === 'preset' && value?.preset === p.value
          return (
            <button key={p.value} onClick={() => onChange({ type: 'preset', preset: p.value })}
              className="text-left px-2 py-1.5 rounded-lg text-sm"
              style={{ background: active ? 'rgba(99,102,241,0.08)' : 'transparent', color: active ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer', fontWeight: active ? '600' : '400' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const options = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'expired', label: 'Expired' },
  ]
  const activeLabel = options.find(o => o.value === value)?.label

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
        style={{ background: value ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${value ? '#6366f1' : 'var(--border)'}`, color: value ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {value ? activeLabel : 'Status'}
        {value
          ? <X size={12} onClick={e => { e.stopPropagation(); onChange(null) }} style={{ cursor: 'pointer' }} />
          : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-xl shadow-lg z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 140 }}>
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full px-4 py-2.5 text-sm text-left"
              style={{ background: value === opt.value ? 'rgba(99,102,241,0.08)' : 'transparent', color: value === opt.value ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (value !== opt.value) e.currentTarget.style.background = 'transparent' }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Date range pill ───────────────────────────────────────────────────────────

function DateRangePill({ label, value, onChange, presets }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = value !== null

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  function getLabel() {
    if (!value) return label
    if (value.type === 'preset') return presets.find(p => p.value === value.preset)?.label || label
    if (value.type === 'range' && value.range?.from) {
      const f = value.range.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const t = value.range.to ? value.range.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'
      return `${f} – ${t}`
    }
    return label
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
        style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', maxWidth: 200 }}>
        <span className="truncate">{getLabel()}</span>
        {active
          ? <X size={12} onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }} style={{ cursor: 'pointer', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-2xl shadow-xl z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <DateFilterPanel
            value={value}
            onChange={v => { onChange(v); if (v?.type === 'preset') setOpen(false) }}
            presets={presets}
          />
        </div>
      )}
    </div>
  )
}

// ── Mobile filter sheet ───────────────────────────────────────────────────────

function MobileFilterSheet({ open, onClose, statusFilter, setStatusFilter, eventDateFilter, setEventDateFilter, expiryFilter, setExpiryFilter, eventPresets, expiryPresets, hasFilters, onClear }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (open) requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    else setVisible(false)
  }, [open])

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'expired', label: 'Expired' },
  ]

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl"
        style={{
          background: 'var(--surface)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
        </div>
        <div className="px-5 py-4 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Filters</h3>
            {hasFilters && (
              <button onClick={onClear} className="text-xs" style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none' }}>Clear all</button>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(opt => (
                <button key={opt.value} onClick={() => setStatusFilter(statusFilter === opt.value ? null : opt.value)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: statusFilter === opt.value ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${statusFilter === opt.value ? '#6366f1' : 'var(--border)'}`, color: statusFilter === opt.value ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Event Date</p>
            <div className="flex flex-wrap gap-2">
              {eventPresets.map(p => {
                const active = eventDateFilter?.preset === p.value
                return (
                  <button key={p.value} onClick={() => setEventDateFilter(active ? null : { type: 'preset', preset: p.value })}
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Expiry</p>
            <div className="flex flex-wrap gap-2">
              {expiryPresets.map(p => {
                const active = expiryFilter?.preset === p.value
                return (
                  <button key={p.value} onClick={() => setExpiryFilter(active ? null : { type: 'preset', preset: p.value })}
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}

// ── Filtering logic ───────────────────────────────────────────────────────────

function getGalleryStatus(g) {
  if (!g.is_active) return 'inactive'
  if (g.expires_at && new Date(g.expires_at) < new Date()) return 'expired'
  return 'active'
}

function matchesDateFilter(dateStr, filter) {
  if (!filter) return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (filter.type === 'range') {
    const { from, to } = filter.range || {}
    if (!from) return true
    if (d < from) return false
    if (to && d > to) return false
    return true
  }
  if (filter.type === 'preset') {
    const p = filter.preset
    const c = new Date(now); c.setHours(0,0,0,0)
    const today = c
    const ms = 86400000
    if (p === 'last_week')     return d >= new Date(today - 7*ms) && d < today
    if (p === 'last_2_weeks')  return d >= new Date(today - 14*ms) && d < today
    if (p === 'last_month')    return d >= new Date(today - 30*ms) && d < today
    if (p === 'last_6_months') return d >= new Date(today - 180*ms) && d < today
    if (p === 'last_year')     return d >= new Date(today - 365*ms) && d < today
    if (p === 'next_week')     return d >= today && d < new Date(today.getTime() + 7*ms)
    if (p === 'next_2_weeks')  return d >= today && d < new Date(today.getTime() + 14*ms)
    if (p === 'next_month')    return d >= today && d < new Date(today.getTime() + 30*ms)
    if (p === 'upcoming')      return d >= today
    if (p === 'past')          return d < today
    if (p === 'soon')          return d >= today && d < new Date(today.getTime() + 30*ms)
    if (p === 'expired')       return d < today
  }
  return true
}

function applyFilters(galleries, { search, status, eventDate, expiry }) {
  return galleries.filter(g => {
    if (search) {
      const q = search.toLowerCase()
      if (!g.title.toLowerCase().includes(q) && !g.client_name?.toLowerCase().includes(q) && !g.event_name?.toLowerCase().includes(q)) return false
    }
    if (status && getGalleryStatus(g) !== status) return false
    if (eventDate && !matchesDateFilter(g.event_date, eventDate)) return false
    if (expiry) {
      if (expiry.type === 'preset' && expiry.preset === 'none') { if (g.expires_at) return false }
      else if (!matchesDateFilter(g.expires_at, expiry)) return false
    }
    return true
  })
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_PRESETS = [
  { value: 'last_week',     label: 'Last week' },
  { value: 'last_2_weeks',  label: 'Last 2 weeks' },
  { value: 'last_month',    label: 'Last month' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_year',     label: 'Last year' },
  { value: 'next_week',     label: 'Next week' },
  { value: 'next_2_weeks',  label: 'Next 2 weeks' },
  { value: 'next_month',    label: 'Next month' },
  { value: 'upcoming',      label: 'Upcoming' },
  { value: 'past',          label: 'Past' },
]

const EXPIRY_PRESETS = [
  { value: 'soon',       label: 'Expiring soon' },
  { value: 'expired',    label: 'Already expired' },
  { value: 'next_week',  label: 'Next week' },
  { value: 'next_month', label: 'Next month' },
  { value: 'none',       label: 'No expiry set' },
]

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [galleries, setGalleries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [eventDateFilter, setEventDateFilter] = useState(null)
  const [expiryFilter, setExpiryFilter] = useState(null)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  useScrollLock(mobileFilterOpen)
  const [toast, setToast] = useState(null)
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())

  useEffect(() => { loadGalleries() }, [])

  async function loadGalleries() {
    try {
      setLoading(true)
      const [galleries, bIds] = await Promise.all([getGalleries(), getBookmarkedGalleryIds()])
      setGalleries(galleries)
      setBookmarkedIds(bIds)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCopyLink(shareToken) {
    navigator.clipboard.writeText(`${window.location.origin}/g/${shareToken}`)
    setToast({ message: 'Gallery link copied!', type: 'success' })
  }

  const hasFilters = statusFilter || eventDateFilter || expiryFilter
  const activeFilterCount = [statusFilter, eventDateFilter, expiryFilter].filter(Boolean).length

  const filtered = applyFilters(galleries, {
    search, status: statusFilter, eventDate: eventDateFilter, expiry: expiryFilter,
  })

  function clearAllFilters() {
    setStatusFilter(null); setEventDateFilter(null); setExpiryFilter(null); setSearch('')
  }

  return (
    <div className="space-y-5 max-w-7xl">
      {/* ── Desktop: title + search + new gallery all in one row ── */}
      <div className="hidden md:flex items-center gap-3">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Galleries</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
          </p>
        </div>
        {galleries.length > 0 && (
          <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search galleries..."
            className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
        )}
        <Button onClick={() => navigate('/galleries/new')} className="shrink-0">
          <Plus size={15} />New Gallery
        </Button>
      </div>

      {/* ── Desktop: filter pills ── */}
      {galleries.length > 0 && (
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <StatusPill value={statusFilter} onChange={setStatusFilter} />
          <DateRangePill label="Event Date" value={eventDateFilter} onChange={setEventDateFilter} presets={EVENT_PRESETS} />
          <DateRangePill label="Expiry Date" value={expiryFilter} onChange={setExpiryFilter} presets={EXPIRY_PRESETS} />
          {hasFilters && (
            <button onClick={clearAllFilters} className="text-xs"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Mobile: title + actions row, then search row ── */}
      <div className="flex items-center gap-2 md:hidden">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Galleries</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {galleries.length > 0 && (
            <button onClick={() => setMobileFilterOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: hasFilters ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${hasFilters ? '#6366f1' : 'var(--border)'}`, color: hasFilters ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer' }}>
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center"
                  style={{ background: '#6366f1', fontSize: 9, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          <Button onClick={() => navigate('/galleries/new')} className="shrink-0">
            <Plus size={15} />New
          </Button>
        </div>
      </div>
      {galleries.length > 0 && (
        <div className="relative md:hidden">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search galleries..."
            className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          Failed to load galleries: {error}
        </div>
      )}

      {!loading && !error && galleries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--surface-raised)' }}>
            <Plus size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>No galleries yet</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Create your first gallery to get started</p>
          <Button onClick={() => navigate('/galleries/new')}><Plus size={15} />Create Gallery</Button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <GalleryGrid galleries={filtered} onCopyLink={handleCopyLink} bookmarkedIds={bookmarkedIds} />
      )}

      {!loading && !error && galleries.length > 0 && filtered.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No galleries match your filters</p>
          <button onClick={clearAllFilters} className="text-sm"
            style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none' }}>
            Clear filters
          </button>
        </div>
      )}

      <MobileFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        eventDateFilter={eventDateFilter} setEventDateFilter={setEventDateFilter}
        expiryFilter={expiryFilter} setExpiryFilter={setExpiryFilter}
        eventPresets={EVENT_PRESETS} expiryPresets={EXPIRY_PRESETS}
        hasFilters={hasFilters} onClear={clearAllFilters}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
