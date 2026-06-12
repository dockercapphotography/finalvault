import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Image, X, ChevronDown } from 'lucide-react'

/**
 * GalleryPicker — searchable combobox for selecting a gallery.
 * Modeled after ClientPicker.
 */
export default function GalleryPicker({ galleries = [], value = null, onChange, placeholder = 'Select a gallery...', allowNone = true, noneLabel = 'No specific gallery', noneSubLabel = 'Gallery variables will be left blank' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState({})
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const selected = galleries.find(g => g.id === value) || null

  function positionDropdown() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = Math.min(320, 56 + Math.min(galleries.length + 1, 6) * 52)
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
  }

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleScroll() { positionDropdown() }
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleScroll)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  function handleOpen() {
    positionDropdown()
    setOpen(o => !o)
  }

  function formatDate(dateStr) {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const filtered = galleries.filter(g => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      g.title.toLowerCase().includes(q) ||
      g.event_name?.toLowerCase().includes(q)
    )
  })

  function handleSelect(gallery) {
    onChange(gallery ? gallery.id : null)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange(null)
  }

  const dropdown = open && createPortal(
    <div
      ref={dropdownRef}
      style={{
        ...dropdownStyle,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search galleries..."
            style={{
              width: '100%',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: 6,
              padding: '7px 10px 7px 30px',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
      </div>

      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {allowNone && (
          <button
            type="button"
            onClick={() => handleSelect(null)}
            style={{
              width: '100%', padding: '9px 12px', textAlign: 'left',
              background: value === null ? 'rgba(99,102,241,0.08)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid var(--border)',
            }}
            onMouseEnter={e => { if (value !== null) e.currentTarget.style.background = 'var(--surface-raised)' }}
            onMouseLeave={e => { if (value !== null) e.currentTarget.style.background = 'transparent' }}
          >
            <Image size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: 13, display: 'block', color: 'var(--text)' }}>{noneLabel}</span>
              <span style={{ fontSize: 11, display: 'block', color: 'var(--text-muted)' }}>{noneSubLabel}</span>
            </span>
            {value === null && <span style={{ color: '#6366f1', fontSize: 14, fontWeight: 600 }}>✓</span>}
          </button>
        )}

        {filtered.length === 0 && query && (
          <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            No galleries match "{query}"
          </div>
        )}

        {filtered.map(gallery => {
          const isSelected = gallery.id === value
          const sub = [gallery.event_name, formatDate(gallery.event_date)].filter(Boolean).join(' · ')
          return (
            <button
              key={gallery.id}
              type="button"
              onClick={() => handleSelect(gallery)}
              style={{
                width: '100%', padding: '8px 12px', textAlign: 'left',
                background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                background: isSelected ? '#6366f1' : 'var(--surface-raised)',
                color: isSelected ? '#fff' : 'var(--text-muted)',
              }}>
                <Image size={12} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: isSelected ? 500 : 400, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {gallery.title}
                </span>
                {sub && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{sub}</span>
                )}
              </span>
              {isSelected && <span style={{ color: '#6366f1', fontSize: 14, flexShrink: 0, fontWeight: 600 }}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%',
          background: 'var(--bg-subtle)',
          border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`,
          color: 'var(--text)',
          borderRadius: 8,
          padding: '8px 36px 8px 12px',
          fontSize: 14,
          outline: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 38,
          position: 'relative',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        {selected ? (
          <>
            <span style={{
              width: 20, height: 20, borderRadius: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, background: '#6366f1', color: '#fff',
            }}>
              <Image size={11} />
            </span>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.title}
            </span>
            {(selected.event_name || selected.event_date) && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                {[selected.event_name, formatDate(selected.event_date)].filter(Boolean).join(' · ')}
              </span>
            )}
          </>
        ) : (
          <>
            <Image size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{placeholder}</span>
          </>
        )}
        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 2 }}>
          {selected && (
            <span
              onClick={handleClear}
              style={{ display: 'flex', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} style={{
            color: 'var(--text-muted)',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }} />
        </span>
      </button>
      {dropdown}
    </div>
  )
}
