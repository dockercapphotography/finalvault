import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import Button from '../ui/Button.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}

/**
 * MicrositeFocalPointModal — same drag-to-set-a-point interaction as
 * CoverPickerModal's focal stage, applied to whatever image is already
 * chosen for Hero or About (this modal doesn't handle image selection,
 * only the focus point of an image already picked). Uses the
 * authenticated preview fetch (not ?microsite=1) since the image may not
 * be saved to the microsite yet, so the public access check wouldn't
 * recognize it as legitimate until after Save.
 */
export default function MicrositeFocalPointModal({ r2Key, initialFocusX = 0.5, initialFocusY = 0.5, onSave, onClose }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [focusX, setFocusX] = useState(initialFocusX)
  const [focusY, setFocusY] = useState(initialFocusY)
  const focalRef = useRef(null)
  const isDragging = useRef(false)

  useEffect(() => {
    let cancelled = false
    let blobUrl = null
    fetchAuthedBlob(r2Key).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return }
      blobUrl = url
      setImageUrl(url)
    }).catch(() => {})
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [r2Key])

  function updatePoint(e) {
    const rect = focalRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null || clientY == null) return
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    setFocusX(x)
    setFocusY(y)
  }

  function handlePointerDown(e) { isDragging.current = true; updatePoint(e) }
  function handlePointerMove(e) { if (isDragging.current) updatePoint(e) }
  function handlePointerUp() { isDragging.current = false }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Adjust focus point</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Drag the circle to set what stays in frame, even in the site's tighter or wider crop shapes.
          </p>
          {imageUrl ? (
            <div
              ref={focalRef}
              className="relative rounded-xl overflow-hidden"
              style={{ cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                src={imageUrl}
                alt=""
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '55vh', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
                draggable={false}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${focusX * 100}%`, top: `${focusY * 100}%`,
                  transform: 'translate(-50%, -50%)', width: 28, height: 28,
                  borderRadius: '50%', border: '3px solid white',
                  background: 'rgba(99,102,241,0.5)',
                  boxShadow: '0 0 0 1px #6366f1, 0 2px 8px rgba(0,0,0,0.5)',
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => onSave(focusX, focusY)}>Save focus point</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
