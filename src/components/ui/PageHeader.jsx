import { useState, useRef, useEffect } from 'react'
import { Search as SearchIcon, Plus } from 'lucide-react'
import Button from './Button.jsx'
import FilterSortControl from './FilterSortControl.jsx'

// ── PageHeader ───────────────────────────────────────────────────────────
// Unified title + search + Filters & sort + create-action(s) header, used
// by every list page (Dashboard, Clients, Sessions, ...) instead of each
// page hand-rolling its own layout. Order is deliberate and consistent
// everywhere: search and Filters & sort sit together (both "narrow down
// what's shown"), create action(s) stay rightmost and visually heaviest
// (the one thing that *adds* rather than narrows).
//
// Props:
//   title          : string
//   subtitle       : string | undefined
//   search         : { value, onChange, placeholder } | undefined
//   filterSections : FilterSortControl sections config | undefined
//                    (omit entirely on pages with nothing to filter/sort)
//   onClearAllFilters : optional override, passed through to FilterSortControl
//   primaryAction  : { label, icon, onClick } | undefined -- solid button,
//                    e.g. "New Gallery" / "New Client"
//   secondaryActions : [{ label, icon, onClick }] -- bordered buttons,
//                    e.g. Dashboard's "New Folder"
//   extra          : ReactNode rendered at the end of the desktop toolbar,
//                    after Filters & sort and before the action buttons
//                    (e.g. Dashboard's grid Display dropdown -- a view
//                    preference, not a filter/sort/create concept, so it
//                    doesn't fit any of the typed slots above)
//
// Mobile: search drops to its own full-width row below the title (no room
// to sit inline). Filters & sort collapses to its own icon trigger
// (FilterSortControl already does this internally). primaryAction +
// secondaryActions collapse into a single "+" icon -- opening a small menu
// if there's more than one action, or triggering directly if there's just
// the one primary action.

function MobileActionMenu({ primaryAction, secondaryActions = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const allActions = [primaryAction, ...secondaryActions].filter(Boolean)

  useEffect(() => {
    if (!open) return
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  if (allActions.length === 0) return null

  const iconButtonStyle = {
    width: 44, height: 44, background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }

  if (allActions.length === 1) {
    const a = allActions[0]
    return (
      <button onClick={a.onClick} className="flex items-center justify-center rounded-xl" style={iconButtonStyle} aria-label={a.label}>
        <a.icon size={18} />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-center rounded-xl" style={iconButtonStyle} aria-label="Create">
        <Plus size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 170 }}>
          {allActions.map((a, i) => (
            <button key={i} onClick={() => { setOpen(false); a.onClick() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <a.icon size={15} />{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchInput({ search, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        type="text" value={search.value} onChange={e => search.onChange(e.target.value)}
        placeholder={search.placeholder || 'Search...'}
        className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

export default function PageHeader({
  title, subtitle,
  search, filterSections, onClearAllFilters,
  primaryAction, secondaryActions = [], extra,
}) {
  return (
    <div className="space-y-3">
      {/* Title row -- mobile action cluster lives here since there's no
          room for full-width search inline with it on small screens */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 md:hidden flex-shrink-0">
          {filterSections && <FilterSortControl sections={filterSections} onClearAll={onClearAllFilters} />}
          <MobileActionMenu primaryAction={primaryAction} secondaryActions={secondaryActions} />
        </div>
      </div>

      {/* Mobile search -- own full-width row */}
      {search && <SearchInput search={search} className="md:hidden" />}

      {/* Desktop toolbar -- search, Filters & sort, extra, then actions */}
      <div className="hidden md:flex items-center gap-2">
        {search && <SearchInput search={search} className="flex-1" />}
        {filterSections && <FilterSortControl sections={filterSections} onClearAll={onClearAllFilters} />}
        {extra}
        <div className="ml-auto flex items-center gap-2">
          {secondaryActions.map((a, i) => (
            <Button key={i} variant="secondary" onClick={a.onClick} className="flex-shrink-0">
              <a.icon size={15} />{a.label}
            </Button>
          ))}
          {primaryAction && (
            <Button variant="primary" onClick={primaryAction.onClick} className="flex-shrink-0">
              <primaryAction.icon size={15} />{primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
