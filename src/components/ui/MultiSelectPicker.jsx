import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, ChevronDown, Plus } from 'lucide-react'

/**
 * MultiSelectPicker — searchable combobox for selecting multiple items
 * from a list, shown as removable chips above a "Add another..." trigger.
 * Same visual/interaction pattern as ClientPicker (portal-positioned
 * dropdown, search box, click-outside/scroll/resize handling), but
 * generic for any { id, name } shaped list and multi-select rather than
 * single-select -- used for questionnaire and contract template
 * assignment on shoot types.
 */
export default function MultiSelectPicker({
  items = [], selectedIds = [], onChange,
  placeholder = 'Add...', emptyMessage = 'Nothing to select yet.',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState({})
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const selectedItems = selectedIds.map(id => items.find(i => i.id === id)).filter(Boolean)
  const available = items.filter(i => !selectedIds.includes(i.id))

  function positionDropdown() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = Math.min(260, 56 + Math.min(available.length, 6) * 40)
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

  const filtered = available.filter(i => {
    if (!query.trim()) return true
    return i.name.toLowerCase().includes(query.trim().toLowerCase())
  })

  function handleSelect(item) {
    onChange([...selectedIds, item.id])
    setOpen(false)
    setQuery('')
  }

  function handleRemove(id) {
    onChange(selectedIds.filter(sid => sid !== id))
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
            placeholder="Search..."
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

      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            {query ? `Nothing matches "${query}"` : 'Nothing left to add'}
          </div>
        )}

        {filtered.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item)}
            style={{
              width: '100%', padding: '8px 12px', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{item.name}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  )

  return (
    <div>
      {selectedItems.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid var(--border)' }}>
          {selectedItems.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 px-3 py-2"
              style={{ borderBottom: i < selectedItems.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <span className="flex-1 min-w-0 text-xs truncate" style={{ color: 'var(--text)' }}>{item.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', flexShrink: 0, display: 'flex' }}
                title="Remove"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
      ) : (
        <div style={{ position: 'relative', width: '100%' }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={handleOpen}
            style={{
              width: '100%',
              background: 'var(--bg-subtle)',
              border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`,
              color: 'var(--text-muted)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 13,
              outline: 'none',
              cursor: available.length === 0 ? 'default' : 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: available.length === 0 ? 0.6 : 1,
            }}
            disabled={available.length === 0}
          >
            <Plus size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{selectedItems.length > 0 ? placeholder.replace('Add', 'Add another') : placeholder}</span>
            <ChevronDown size={13} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} />
          </button>
          {dropdown}
        </div>
      )}
    </div>
  )
}
