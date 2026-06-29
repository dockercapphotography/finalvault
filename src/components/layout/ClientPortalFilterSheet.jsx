import { useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import BottomSheet from './BottomSheet.jsx'

// Mirrors Dashboard.jsx's MobileFilterSheet drill-down pattern (main
// screen -> row -> back), built on the same shared BottomSheet shell, but
// scoped to what actually applies to a client looking at their OWN
// galleries -- no Status (active/inactive is folded into "Show" below
// instead, since a client doesn't have a separate concept of "inactive"
// vs "expired" the way a photographer managing their whole library does)
// and no Tags (a photographer's internal organizational tool for their
// business, meaningless from a single client's seat). Event date presets
// kept deliberately simpler than the dashboard's full preset list --
// "Last year" / "Last 6 months" / "All time" covers the realistic case of
// a multi-year repeat client without importing every preset the
// photographer-facing version has.
const EVENT_DATE_PRESETS = [
  { value: 'all', label: 'All time' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_year', label: 'Last year' },
  { value: 'last_2_years', label: 'Last 2 years' },
]

function eventDateLabel(filter) {
  if (filter.type === 'preset') return EVENT_DATE_PRESETS.find(o => o.value === filter.value)?.label || 'All time'
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const from = fmt(filter.from)
  const to = fmt(filter.to)
  if (from && to) return `${from} – ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return 'Custom range'
}

function isEventDateActive(filter) {
  return filter.type === 'preset' ? filter.value !== 'all' : !!(filter.from || filter.to)
}

const SHOW_OPTIONS = [
  { value: 'all', label: 'Any' },
  { value: 'active', label: 'Active only' },
  { value: 'expired', label: 'Expired only' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

const rowStyle = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
  borderBottom: '1px solid var(--border)', textAlign: 'left',
}
const rowLabelStyle = { fontSize: 15, color: 'var(--text)' }
const rowValStyle = active => ({
  fontSize: 14, color: active ? '#6366f1' : 'var(--text-muted)',
  display: 'flex', alignItems: 'center', gap: 4,
})

function optionLabel(options, value) {
  return options.find(o => o.value === value)?.label || ''
}

export default function ClientPortalFilterSheet({
  open, onClose,
  eventDate, setEventDate,
  show, setShow,
  sort, setSort,
}) {
  const [subScreen, setSubScreen] = useState(null) // null | 'eventDate' | 'eventDateRange' | 'show' | 'sort'

  function SubScreenHeader({ title }) {
    return (
      <div className="flex items-center" style={{ padding: '4px 20px 12px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setSubScreen(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, padding: 0, marginRight: 'auto' }}>
          <ChevronLeft size={16} />Back
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>{title}</span>
      </div>
    )
  }

  function OptionList({ options, value, onChange }) {
    return (
      <div style={{ padding: '8px 0' }}>
        {options.map(o => (
          <button key={o.value} onClick={() => { onChange(o.value); setSubScreen(null) }}
            style={{ ...rowStyle, color: value === o.value ? '#6366f1' : 'var(--text)' }}>
            <span style={rowLabelStyle}>{o.label}</span>
            {value === o.value && <span style={{ color: '#6366f1' }}>✓</span>}
          </button>
        ))}
      </div>
    )
  }

  function handleClose() {
    setSubScreen(null)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      {subScreen === null && (
        <>
          <div style={{ padding: '4px 20px 14px' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Filters &amp; sort</p>
          </div>
          <button style={rowStyle} onClick={() => setSubScreen('eventDate')}>
            <span style={rowLabelStyle}>Event date</span>
            <span style={rowValStyle(isEventDateActive(eventDate))}>
              {eventDateLabel(eventDate)}<ChevronRight size={14} />
            </span>
          </button>
          <button style={rowStyle} onClick={() => setSubScreen('show')}>
            <span style={rowLabelStyle}>Show</span>
            <span style={rowValStyle(show !== 'all')}>
              {optionLabel(SHOW_OPTIONS, show)}<ChevronRight size={14} />
            </span>
          </button>
          <button style={{ ...rowStyle, borderBottom: 'none' }} onClick={() => setSubScreen('sort')}>
            <span style={rowLabelStyle}>Sort by</span>
            <span style={rowValStyle(false)}>
              {optionLabel(SORT_OPTIONS, sort)}<ChevronRight size={14} />
            </span>
          </button>
          <div style={{ padding: '16px 20px 24px' }}>
            <button onClick={handleClose}
              style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </>
      )}

      {subScreen === 'eventDate' && (
        <>
          <SubScreenHeader title="Event date" />
          <div style={{ padding: '8px 0' }}>
            {EVENT_DATE_PRESETS.map(o => (
              <button key={o.value} onClick={() => { setEventDate({ type: 'preset', value: o.value }); setSubScreen(null) }}
                style={{ ...rowStyle, color: (eventDate.type === 'preset' && eventDate.value === o.value) ? '#6366f1' : 'var(--text)' }}>
                <span style={rowLabelStyle}>{o.label}</span>
                {eventDate.type === 'preset' && eventDate.value === o.value && <span style={{ color: '#6366f1' }}>✓</span>}
              </button>
            ))}
            <button onClick={() => setSubScreen('eventDateRange')}
              style={{ ...rowStyle, borderBottom: 'none', color: eventDate.type === 'range' ? '#6366f1' : 'var(--text)' }}>
              <span style={rowLabelStyle}>Custom range</span>
              <span style={{ color: '#6366f1' }}>{eventDate.type === 'range' ? '✓' : <ChevronRight size={14} />}</span>
            </button>
          </div>
        </>
      )}
      {subScreen === 'eventDateRange' && (
        <>
          <SubScreenHeader title="Custom range" />
          <div style={{ padding: '16px 20px' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>From</label>
            <input type="date"
              value={eventDate.type === 'range' ? (eventDate.from || '') : ''}
              onChange={e => setEventDate(prev => ({
                type: 'range',
                from: e.target.value || null,
                to: prev.type === 'range' ? prev.to : null,
              }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14, marginBottom: 14 }} />
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>To</label>
            <input type="date"
              value={eventDate.type === 'range' ? (eventDate.to || '') : ''}
              onChange={e => setEventDate(prev => ({
                type: 'range',
                from: prev.type === 'range' ? prev.from : null,
                to: e.target.value || null,
              }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14, marginBottom: 18 }} />
            <button onClick={() => setSubScreen(null)}
              style={{ width: '100%', padding: 12, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Apply
            </button>
          </div>
        </>
      )}
      {subScreen === 'show' && (
        <>
          <SubScreenHeader title="Show" />
          <OptionList options={SHOW_OPTIONS} value={show} onChange={setShow} />
        </>
      )}
      {subScreen === 'sort' && (
        <>
          <SubScreenHeader title="Sort by" />
          <OptionList options={SORT_OPTIONS} value={sort} onChange={setSort} />
        </>
      )}
    </BottomSheet>
  )
}
