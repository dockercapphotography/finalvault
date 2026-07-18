import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal, ChevronRight, ChevronLeft, ChevronDown, Check, Search } from 'lucide-react'
import BottomSheet from '../layout/BottomSheet.jsx'

// ── FilterSortControl ───────────────────────────────────────────────────────
// One "Filters & sort" button (icon + label, purple when active) that opens
// either a mobile bottom-sheet drill-down or a desktop panel, driven
// entirely by a declarative `sections` config. This generalizes the pattern
// originally built for the Client Portal (ClientPortalFilterSheet + the
// DesktopFilterPanel in ClientPortalGalleries.jsx) so every
// photographer-facing list page can share the exact same interaction and
// visual language instead of each having its own bespoke filter UI.
//
// The desktop panel is rendered through a portal to document.body with its
// position computed from the trigger button's real screen coordinates
// (getBoundingClientRect), rather than CSS position:absolute anchored to a
// position:relative ancestor. That containing-block approach is fragile --
// it depends on no ancestor between the trigger and the panel introducing
// its own scroll container, transform, or filter, any of which silently
// changes what the panel positions itself relative to. Different pages'
// layouts don't all give that guarantee, so the portal + real-coordinates
// approach (the same technique BottomSheet.jsx already uses) is used
// instead -- it's correct regardless of ancestor structure.
//
// Section shape:
//   {
//     key: string,               // unique key
//     label: string,              // e.g. "Status"
//     type: 'select' | 'multiSelect' | 'dateRange' | 'sort',
//     value: any,
//     onChange: (newValue) => void,
//     options: [{ value, label, color? }],   // select / multiSelect / sort
//     presets: [{ value, label }],            // dateRange only
//     placeholder: string,                    // shown when inactive (default 'Any')
//     summary: (value) => string,              // optional override
//     isActive: (value) => boolean,            // optional override
//   }
//
// Value contracts (all null-able to mean "no filter"):
//   select      : null | optionValue
//   multiSelect : [] | [optionValue, ...]
//   dateRange   : null | { type: 'preset', value } | { type: 'range', from, to }
//                 (from/to are 'YYYY-MM-DD' strings from <input type="date">)
//   sort        : always a real optionValue (never "empty" -- excluded from
//                 hasActiveFilters / Clear all)
//
// Props:
//   sections      : Section[]
//   onClearAll    : optional override for the "Clear all" behavior. Default
//                   resets every non-sort section to its empty value.
//   panelWidth    : desktop panel width in px (default 240)

function emptyValueFor(section) {
  if (section.type === 'multiSelect') return []
  return null
}

function isActiveDefault(section) {
  const v = section.value
  if (section.type === 'sort') return false
  if (section.type === 'multiSelect') return Array.isArray(v) && v.length > 0
  if (section.type === 'dateRange') return v != null && (v.type === 'preset' ? true : !!(v.from || v.to))
  return v !== null && v !== undefined && v !== ''
}

function formatDateShort(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function summaryDefault(section) {
  const { type, value, options = [], presets = [], placeholder = 'Any' } = section
  if (type === 'select' || type === 'sort') {
    return options.find(o => o.value === value)?.label ?? placeholder
  }
  if (type === 'multiSelect') {
    if (!value || value.length === 0) return placeholder
    if (value.length === 1) return options.find(o => o.value === value[0])?.label ?? '1 selected'
    return `${value.length} selected`
  }
  if (type === 'dateRange') {
    if (!value) return placeholder
    if (value.type === 'preset') return presets.find(p => p.value === value.value)?.label ?? placeholder
    const from = formatDateShort(value.from)
    const to = formatDateShort(value.to)
    if (from && to) return `${from} – ${to}`
    if (from) return `From ${from}`
    if (to) return `Until ${to}`
    return 'Custom range'
  }
  return ''
}

function summaryOf(section) { return section.summary ? section.summary(section.value) : summaryDefault(section) }
function isActiveOf(section) { return section.isActive ? section.isActive(section.value) : isActiveDefault(section) }

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

function triggerButtonStyle(active) {
  return {
    background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
    border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
    color: active ? '#6366f1' : 'var(--text)',
    cursor: 'pointer',
  }
}

// A multiSelect section (e.g. Tags) can have far more options than fit
// comfortably inline in the main panel -- rendering them all as an
// always-expanded checklist doesn't scale and is awkward to scroll (a
// scroll area nested inside an already-scrolling panel). This collapses
// to a single summary trigger, matching every other section, and opens
// its own small dropdown -- with a search box once there are enough
// options to need one -- via the same portal + real-coordinates
// technique as the outer panel (and as ClientPicker.jsx elsewhere in the
// app), so it's correctly positioned regardless of ancestor structure.
function DesktopMultiSelect({ section, selectStyle }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const value = section.value || []
  const options = section.options || []

  // Own portal, positioned from real screen coordinates -- same reasoning
  // as the outer panel: this needs to scroll independently of wherever
  // the outer panel happens to be scrolled to, not be nested inside it
  // (nesting it caused a double-scroll: scroll the outer panel down to
  // even see the dropdown, then scroll again inside the dropdown itself).
  useEffect(() => {
    if (!open) return
    function updatePos() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  useEffect(() => { if (!open) setQuery('') }, [open])

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{section.label}</label>
      <button ref={triggerRef} onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
        style={open ? { ...selectStyle, borderRadius: '8px 8px 0 0', borderBottom: 'none' } : selectStyle}>
        <span className="truncate">{summaryOf(section)}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {/* data-fsc-popover marks this for the outer panel's click-outside
          check (see FilterSortControl below) -- this lives in its own
          portal, not as a DOM descendant of the outer panel, so without
          this marker a click in here looks like a click "outside" the
          panel and would incorrectly close the whole thing. */}
      {open && pos && createPortal(
        <div ref={dropdownRef} data-fsc-popover="true"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 180),
            background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '0 0 8px 8px',
            boxShadow: '0 4px 10px -2px rgba(0,0,0,0.08)',
            zIndex: 110, overflow: 'hidden',
          }}>
          {options.length > 6 && (
            <div className="flex items-center gap-1.5" style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
              <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${section.label.toLowerCase()}...`} autoFocus
                style={{ width: '100%', border: 'none', outline: 'none', background: 'none', color: 'var(--text)', fontSize: 12.5 }} />
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)', padding: '8px 10px' }}>No matches</p>
            )}
            {filtered.map(o => {
              const selected = value.includes(o.value)
              return (
                <button key={o.value} onClick={() => section.onChange(selected ? value.filter(v => v !== o.value) : [...value, o.value])}
                  className="w-full flex items-center gap-2 text-left"
                  style={{ background: selected ? 'var(--surface-raised)' : 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', padding: '6px 10px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = selected ? 'var(--surface-raised)' : 'transparent'}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${selected ? '#6366f1' : 'var(--border-strong)'}`,
                    background: selected ? '#6366f1' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Check size={9} style={{ color: '#fff' }} />}
                  </span>
                  {o.color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
          {value.length > 0 && (
            <button onClick={() => section.onChange([])}
              className="w-full text-left"
              style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', padding: '7px 10px' }}>
              Clear {section.label.toLowerCase()}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function FilterSortControl({ sections, onClearAll, panelWidth = 240 }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [subScreen, setSubScreen] = useState(null) // null | sectionKey | `${sectionKey}:range`
  const [panelPos, setPanelPos] = useState(null) // { top, right } in viewport px
  const desktopButtonRef = useRef(null)
  const desktopPanelRef = useRef(null)

  // Position the portaled panel from the trigger button's real screen
  // coordinates -- correct regardless of what's between them in the DOM.
  useEffect(() => {
    if (!desktopOpen) return
    function updatePos() {
      const btn = desktopButtonRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      setPanelPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [desktopOpen])

  useEffect(() => {
    if (!desktopOpen) return
    function handleClickOutside(e) {
      if (desktopButtonRef.current?.contains(e.target)) return
      if (desktopPanelRef.current?.contains(e.target)) return
      // Nested popovers (e.g. the Tags multiSelect dropdown) live in their
      // own separate portal for independent scrolling, so they're not a
      // DOM descendant of desktopPanelRef -- recognize them via this data
      // attribute instead, or a click inside one would look like a click
      // "outside" the panel and incorrectly close it.
      if (e.target.closest?.('[data-fsc-popover]')) return
      setDesktopOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [desktopOpen])

  const hasActiveFilters = sections.some(isActiveOf)

  function handleClearAll() {
    if (onClearAll) { onClearAll(); return }
    for (const s of sections) {
      if (s.type === 'sort') continue
      s.onChange(emptyValueFor(s))
    }
  }

  function closeMobile() { setMobileOpen(false); setSubScreen(null) }

  function SubScreenHeader({ title, onClear }) {
    return (
      <div className="flex items-center" style={{ padding: '4px 20px 12px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setSubScreen(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, padding: 0, marginRight: 'auto' }}>
          <ChevronLeft size={16} />Back
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>{title}</span>
        {onClear && (
          <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 13, padding: 0, marginLeft: 'auto' }}>Clear</button>
        )}
      </div>
    )
  }

  function renderMobileSubScreen(section) {
    if (section.type === 'select' || section.type === 'sort') {
      return (
        <>
          <SubScreenHeader title={section.label} />
          <div style={{ padding: '8px 0' }}>
            {section.type === 'select' && (
              <button onClick={() => { section.onChange(null); setSubScreen(null) }}
                style={{ ...rowStyle, color: section.value == null ? '#6366f1' : 'var(--text)' }}>
                <span style={rowLabelStyle}>{section.placeholder || 'Any'}</span>
                {section.value == null && <Check size={14} style={{ color: '#6366f1' }} />}
              </button>
            )}
            {(section.options || []).map(o => (
              <button key={o.value} onClick={() => { section.onChange(o.value); setSubScreen(null) }}
                style={{ ...rowStyle, color: section.value === o.value ? '#6366f1' : 'var(--text)' }}>
                <span style={rowLabelStyle}>{o.label}</span>
                {section.value === o.value && <Check size={14} style={{ color: '#6366f1' }} />}
              </button>
            ))}
          </div>
        </>
      )
    }
    if (section.type === 'multiSelect') {
      const value = section.value || []
      return (
        <>
          <SubScreenHeader title={section.label} onClear={value.length > 0 ? () => section.onChange([]) : null} />
          <div style={{ padding: '8px 0' }}>
            {(section.options || []).map(o => {
              const selected = value.includes(o.value)
              return (
                <button key={o.value} onClick={() => section.onChange(selected ? value.filter(v => v !== o.value) : [...value, o.value])}
                  style={{ ...rowStyle, gap: 12 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `1.5px solid ${selected ? '#6366f1' : 'var(--border-strong)'}`,
                    background: selected ? '#6366f1' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <Check size={12} style={{ color: '#fff' }} />}
                  </span>
                  {o.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />}
                  <span style={{ ...rowLabelStyle, flex: 1 }}>{o.label}</span>
                </button>
              )
            })}
          </div>
          <div style={{ padding: '16px 20px 24px' }}>
            <button onClick={() => setSubScreen(null)}
              style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </>
      )
    }
    if (section.type === 'dateRange') {
      const value = section.value
      return (
        <>
          <SubScreenHeader title={section.label} />
          <div style={{ padding: '8px 0' }}>
            <button onClick={() => { section.onChange(null); setSubScreen(null) }}
              style={{ ...rowStyle, color: value == null ? '#6366f1' : 'var(--text)' }}>
              <span style={rowLabelStyle}>{section.placeholder || 'Any'}</span>
              {value == null && <Check size={14} style={{ color: '#6366f1' }} />}
            </button>
            {(section.presets || []).map(p => {
              const selected = value?.type === 'preset' && value.value === p.value
              return (
                <button key={p.value} onClick={() => { section.onChange({ type: 'preset', value: p.value }); setSubScreen(null) }}
                  style={{ ...rowStyle, color: selected ? '#6366f1' : 'var(--text)' }}>
                  <span style={rowLabelStyle}>{p.label}</span>
                  {selected && <Check size={14} style={{ color: '#6366f1' }} />}
                </button>
              )
            })}
            <button onClick={() => setSubScreen(`${section.key}:range`)}
              style={{ ...rowStyle, borderBottom: 'none', color: value?.type === 'range' ? '#6366f1' : 'var(--text)' }}>
              <span style={rowLabelStyle}>Custom range</span>
              {value?.type === 'range' ? <Check size={14} style={{ color: '#6366f1' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
            </button>
          </div>
        </>
      )
    }
    return null
  }

  function renderMobileDateRangeScreen(section) {
    const value = section.value?.type === 'range' ? section.value : { from: null, to: null }
    return (
      <>
        <SubScreenHeader title="Custom range" />
        <div style={{ padding: '16px 20px' }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>From</label>
          <input type="date" value={value.from || ''}
            onChange={e => section.onChange({ type: 'range', from: e.target.value || null, to: value.to })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>To</label>
          <input type="date" value={value.to || ''}
            onChange={e => section.onChange({ type: 'range', from: value.from, to: e.target.value || null })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />
          <button onClick={() => setSubScreen(null)}
            style={{ width: '100%', padding: 12, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Apply
          </button>
        </div>
      </>
    )
  }

  const activeSection = subScreen && !subScreen.includes(':') ? sections.find(s => s.key === subScreen) : null
  const activeRangeSection = subScreen && subScreen.endsWith(':range') ? sections.find(s => s.key === subScreen.split(':')[0]) : null

  // ── Desktop panel controls ──
  const selectStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', cursor: 'pointer',
  }

  function renderDesktopSection(section) {
    if (section.type === 'select' || section.type === 'sort') {
      return (
        <div key={section.key}>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{section.label}</label>
          <select value={section.value ?? ''} onChange={e => section.onChange(e.target.value === '' ? null : e.target.value)} style={selectStyle}>
            {section.type === 'select' && <option value="">{section.placeholder || 'Any'}</option>}
            {(section.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )
    }
    if (section.type === 'multiSelect') {
      return <DesktopMultiSelect key={section.key} section={section} selectStyle={selectStyle} />
    }
    if (section.type === 'dateRange') {
      const value = section.value
      return (
        <div key={section.key}>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{section.label}</label>
          <select
            value={value == null ? '' : value.type === 'preset' ? value.value : 'custom'}
            onChange={e => {
              const v = e.target.value
              if (v === '') section.onChange(null)
              else if (v === 'custom') section.onChange({ type: 'range', from: null, to: null })
              else section.onChange({ type: 'preset', value: v })
            }}
            style={selectStyle}>
            <option value="">{section.placeholder || 'Any'}</option>
            {(section.presets || []).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            <option value="custom">Custom range...</option>
          </select>
          {value?.type === 'range' && (
            <div className="space-y-1.5 mt-2">
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>From</label>
                <input type="date" value={value.from || ''}
                  onChange={e => section.onChange({ type: 'range', from: e.target.value || null, to: value.to })}
                  style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>To</label>
                <input type="date" value={value.to || ''}
                  onChange={e => section.onChange({ type: 'range', from: value.from, to: e.target.value || null })}
                  style={{ ...selectStyle, fontSize: 12, padding: '6px 8px' }} />
              </div>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <>
      {/* Mobile trigger */}
      <button onClick={() => setMobileOpen(true)}
        className="md:hidden flex items-center justify-center rounded-xl flex-shrink-0"
        style={{ ...triggerButtonStyle(hasActiveFilters), width: 44, height: 44, borderRadius: 12 }}
        aria-label="Filters and sort">
        <SlidersHorizontal size={18} />
      </button>

      {/* Desktop trigger */}
      <button ref={desktopButtonRef} onClick={() => setDesktopOpen(o => !o)}
        className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
        style={triggerButtonStyle(hasActiveFilters)}>
        <SlidersHorizontal size={13} />Filters &amp; sort
      </button>

      {/* Desktop panel -- portaled to document.body, positioned from the
          trigger button's real screen coordinates (see effect above) so it
          can never end up clipped or mispositioned by an ancestor's own
          scroll container, transform, or overflow. */}
      {desktopOpen && panelPos && createPortal(
        <div ref={desktopPanelRef} className="space-y-3"
          style={{
            position: 'fixed', top: panelPos.top, right: panelPos.right,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
            zIndex: 100, padding: 12, width: panelWidth,
            maxHeight: `calc(100vh - ${panelPos.top + 16}px)`, overflowY: 'auto',
          }}>
          {sections.map(renderDesktopSection)}
          {hasActiveFilters && (
            <button onClick={handleClearAll} className="text-xs w-full text-left"
              style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear all
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Mobile sheet */}
      <BottomSheet open={mobileOpen} onClose={closeMobile}>
        {subScreen === null && (
          <>
            <div className="flex items-center justify-between" style={{ padding: '4px 20px 14px' }}>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Filters &amp; sort</p>
              {hasActiveFilters && (
                <button onClick={handleClearAll} style={{ fontSize: 13, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
              )}
            </div>
            {sections.map((section, i) => (
              <button key={section.key} onClick={() => setSubScreen(section.key)}
                style={i === sections.length - 1 ? { ...rowStyle, borderBottom: 'none' } : rowStyle}>
                <span style={rowLabelStyle}>{section.label}</span>
                <span style={rowValStyle(isActiveOf(section))}>
                  {summaryOf(section)}<ChevronRight size={14} />
                </span>
              </button>
            ))}
            <div style={{ padding: '16px 20px 24px' }}>
              <button onClick={closeMobile}
                style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </>
        )}
        {activeSection && renderMobileSubScreen(activeSection)}
        {activeRangeSection && renderMobileDateRangeScreen(activeRangeSection)}
      </BottomSheet>
    </>
  )
}
