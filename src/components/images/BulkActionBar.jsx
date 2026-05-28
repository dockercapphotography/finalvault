import { useState, useRef, useEffect } from 'react'
import { X, Trash2, Download, FolderInput } from 'lucide-react'

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

export default function BulkActionBar({ count, onClearSelection, onDeleteSelected, onSelectAll, totalCount, sets, onMoveToSet, onDownloadSelected }) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const moveRef = useRef(null)
  const downloadRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (!moveRef.current?.contains(e.target)) setShowMoveMenu(false)
      if (!downloadRef.current?.contains(e.target)) setShowDownloadMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          Select all {totalCount}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Download */}
      {onDownloadSelected && (
        <div ref={downloadRef} className="relative">
          <button
            onClick={() => setShowDownloadMenu(p => !p)}
            style={{ ...btnBase, color: 'rgba(255,255,255,0.6)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Download size={14} />
            Download
          </button>
          {showDownloadMenu && (
            <div className="absolute bottom-full mb-2 left-0 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', minWidth: 140 }}>
              <button onClick={() => { onDownloadSelected(false); setShowDownloadMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm"
                style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Web Size (ZIP)
              </button>
              <button onClick={() => { onDownloadSelected(true); setShowDownloadMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm"
                style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                Originals (ZIP)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Move to Set */}
      {sets?.length > 0 && onMoveToSet && (
        <div ref={moveRef} className="relative">
          <button
            onClick={() => setShowMoveMenu(p => !p)}
            style={{ ...btnBase, color: 'rgba(255,255,255,0.6)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <FolderInput size={14} />
            Move
          </button>
          {showMoveMenu && (
            <div className="absolute bottom-full mb-2 left-0 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', minWidth: 140 }}>
              {sets.map(s => (
                <button key={s.id} onClick={() => { onMoveToSet(s.id); setShowMoveMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm truncate"
                  style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* Delete */}
      <button
        onClick={onDeleteSelected}
        style={{ ...btnBase, color: '#f87171' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}
