import { useState, useRef, useEffect } from 'react'
import { X, Trash2, Download, FolderInput, Droplets, CheckSquare } from 'lucide-react'

export default function BulkActionBar({ count, onClearSelection, onDeleteSelected, onSelectAll, totalCount, sets, onMoveToSet, onDownloadSelected, onWatermarkSelected }) {
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

  const btn = (color = 'rgba(255,255,255,0.6)') => ({
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color,
    whiteSpace: 'nowrap',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  })

  const hoverIn = e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
  const hoverOut = e => e.currentTarget.style.background = 'transparent'

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 px-2 py-2 rounded-2xl shadow-xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 'calc(100vw - 32px)' }}
    >
      {/* Clear / count */}
      <button onClick={onClearSelection} style={btn()} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
        title="Clear selection">
        <X size={15} />
        <span className="font-medium">{count}</span>
      </button>

      <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* Select all */}
      {count < totalCount && (
        <>
          <button onClick={onSelectAll} style={btn('rgba(255,255,255,0.5)')}
            onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            title={`Select all ${totalCount}`}>
            <CheckSquare size={15} />
          </button>
          <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </>
      )}

      {/* Download */}
      {onDownloadSelected && (
        <div ref={downloadRef} className="relative">
          <button onClick={() => setShowDownloadMenu(p => !p)} style={btn()} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            title="Download">
            <Download size={15} />
            <span className="hidden sm:inline">Download</span>
          </button>
          {showDownloadMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', minWidth: 140 }}>
              <button onClick={() => { onDownloadSelected(false); setShowDownloadMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm"
                style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={hoverIn} onMouseLeave={hoverOut}>Web Size (ZIP)</button>
              <button onClick={() => { onDownloadSelected(true); setShowDownloadMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm"
                style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={hoverIn} onMouseLeave={hoverOut}>Originals (ZIP)</button>
            </div>
          )}
        </div>
      )}

      {/* Move to Set */}
      {sets?.length > 0 && onMoveToSet && (
        <div ref={moveRef} className="relative">
          <button onClick={() => setShowMoveMenu(p => !p)} style={btn()} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            title="Move to set">
            <FolderInput size={15} />
            <span className="hidden sm:inline">Move</span>
          </button>
          {showMoveMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', minWidth: 140 }}>
              {sets.map(s => (
                <button key={s.id} onClick={() => { onMoveToSet(s.id); setShowMoveMenu(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm truncate"
                  style={{ color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Watermark */}
      {onWatermarkSelected && (
        <button onClick={onWatermarkSelected} style={btn()} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
          title="Watermark selected">
          <Droplets size={15} />
          <span className="hidden sm:inline">Watermark</span>
        </button>
      )}

      <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* Delete */}
      <button onClick={onDeleteSelected} style={btn('#f87171')}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.12)'}
        onMouseLeave={hoverOut} title="Delete selected">
        <Trash2 size={15} />
        <span className="hidden sm:inline">Delete</span>
      </button>
    </div>
  )
}
