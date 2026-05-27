import { useState, useRef, useEffect } from 'react'
import { ArrowDownUp, Check } from 'lucide-react'

export const SORT_OPTIONS = [
  { id: 'custom',        label: 'Custom order' },
  { id: 'uploaded_desc', label: 'Uploaded: New → Old' },
  { id: 'uploaded_asc',  label: 'Uploaded: Old → New' },
  { id: 'name_asc',      label: 'Name: A → Z' },
  { id: 'name_desc',     label: 'Name: Z → A' },
]

export function sortImages(images, sortId) {
  const sorted = [...images]
  switch (sortId) {
    case 'uploaded_asc':
      return sorted.sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))
    case 'uploaded_desc':
      return sorted.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    case 'name_asc':
      return sorted.sort((a, b) => (a.file_name || '').localeCompare(b.file_name || '', undefined, { numeric: true, sensitivity: 'base' }))
    case 'name_desc':
      return sorted.sort((a, b) => (b.file_name || '').localeCompare(a.file_name || '', undefined, { numeric: true, sensitivity: 'base' }))
    case 'custom':
    default:
      return sorted.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
}

export default function SortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = SORT_OPTIONS.find(o => o.id === value) || SORT_OPTIONS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
        style={{
          background: open ? 'var(--surface-raised)' : 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = open ? 'var(--border-strong)' : 'var(--border)'}
      >
        <ArrowDownUp size={13} />
        {/* Label hidden on mobile, visible on desktop */}
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-lg z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="px-4 pt-3 pb-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Sort by
          </p>
          {SORT_OPTIONS.map(option => (
            <button
              key={option.id}
              onClick={() => { onChange(option.id); setOpen(false) }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors"
              style={{
                cursor: 'pointer',
                color: option.id === value ? 'var(--text)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {option.label}
              {option.id === value && <Check size={13} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
