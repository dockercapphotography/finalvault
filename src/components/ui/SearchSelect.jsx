import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'

/**
 * SearchSelect — a searchable list of options rendered inline.
 *
 * Props:
 *   options      : Array of { id, label, sublabel?, disabled? }
 *   value        : selected id (or null)
 *   onChange     : (id) => void
 *   placeholder  : search input placeholder
 *   maxHeight    : scrollable area max height (default '280px')
 *   emptyText    : shown when search has no results
 */
export default function SearchSelect({
  options = [],
  value = null,
  onChange,
  placeholder = 'Search...',
  maxHeight = '280px',
  emptyText = 'No results',
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sublabel || '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div>
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          style={{ border: 'none', background: 'transparent', outline: 'none',
            fontSize: 13, color: 'var(--text)', width: '100%' }}
        />
      </div>

      {/* Options list */}
      <div style={{ overflowY: 'auto', maxHeight, borderRadius: 8, border: '1px solid var(--border)' }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>{emptyText}</p>
        ) : (
          filtered.map((o, i) => (
            <button
              key={o.id}
              onClick={() => !o.disabled && onChange(o.id)}
              disabled={o.disabled}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
              style={{
                background: value === o.id ? 'rgba(99,102,241,0.07)' : 'transparent',
                border: 'none',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: o.disabled ? 'not-allowed' : 'pointer',
                opacity: o.disabled ? 0.5 : 1,
                display: 'flex',
              }}
              onMouseEnter={e => { if (!o.disabled && value !== o.id) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { e.currentTarget.style.background = value === o.id ? 'rgba(99,102,241,0.07)' : 'transparent' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: value === o.id ? '#6366f1' : 'var(--text)' }}>
                  {o.label}
                </p>
                {o.sublabel && (
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{o.sublabel}</p>
                )}
              </div>
              {value === o.id && (
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: '#6366f1' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
