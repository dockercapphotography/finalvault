import { useState, useEffect } from 'react'
import { X, Crosshair } from 'lucide-react'
import { fetchAuthedBlob } from '../../utils/authedPreview.js'

// The photo tile used across the Website editor: X (top-right) removes,
// crosshair (bottom-right) adjusts the focus point -- each only when its
// handler is passed. Moved verbatim out of MicrositeEditor.jsx (v1.5.17)
// so the review request modal shows the exact same tile.
export default function GalleryPickThumb({ r2Key, onRemove, onAdjustFocus }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    let blobUrl = null
    fetchAuthedBlob(r2Key).then(u => {
      if (cancelled) { URL.revokeObjectURL(u); return }
      blobUrl = u
      setUrl(u)
    }).catch(() => {})
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [r2Key])

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      {onRemove && (
        <button onClick={onRemove} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer' }}>
          <X size={12} color="#fff" />
        </button>
      )}
      {onAdjustFocus && (
        <button onClick={onAdjustFocus} title="Adjust focus point" className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer' }}>
          <Crosshair size={12} color="#fff" />
        </button>
      )}
    </div>
  )
}
