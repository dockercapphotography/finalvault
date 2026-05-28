import { X, Trash2 } from 'lucide-react'

const btnBase = {
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  borderRadius: '12px',
  padding: '6px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '14px',
  transition: 'background 0.15s',
}

export default function BulkActionBar({ count, onClearSelection, onDeleteSelected, onSelectAll, totalCount }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-2 rounded-2xl shadow-xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', minWidth: '320px' }}
    >
      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        style={{ ...btnBase, color: 'rgba(255,255,255,0.6)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <X size={14} />
        <span className="font-medium">{count} selected</span>
      </button>

      <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* Select all */}
      {count < totalCount && (
        <button
          onClick={onSelectAll}
          style={{ ...btnBase, color: 'rgba(255,255,255,0.6)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Select all {totalCount}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Delete */}
      <button
        onClick={onDeleteSelected}
        style={{ ...btnBase, color: '#f87171' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}
