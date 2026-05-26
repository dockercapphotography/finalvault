import { useState, useEffect, useRef } from 'react'
import { Trash2, StarOff } from 'lucide-react'
import { getWatermarkUrl, updateWatermark, deleteWatermark, setActiveWatermark } from '../../utils/watermarkApi.js'

const POSITIONS = [
  { id: 'top-left',     label: 'Top Left' },
  { id: 'top-right',    label: 'Top Right' },
  { id: 'center',       label: 'Center' },
  { id: 'bottom-left',  label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
]

/**
 * Sample the average brightness of an image using a canvas.
 * Returns a value 0 (black) to 255 (white).
 */
function getImageBrightness(imgEl) {
  try {
    const canvas = document.createElement('canvas')
    const size = 40 // sample at small size for speed
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgEl, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    let total = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] // alpha
      if (a > 10) { // skip transparent pixels
        const r = data[i], g = data[i + 1], b = data[i + 2]
        total += 0.299 * r + 0.587 * g + 0.114 * b
        count++
      }
    }
    return count > 0 ? total / count : 128
  } catch {
    return 128 // fallback if CORS blocks canvas read
  }
}

export default function WatermarkCard({ watermark, isActive, onSetActive, onUpdate, onDelete }) {
  const [label, setLabel]       = useState(watermark.label)
  const [opacity, setOpacity]   = useState(watermark.opacity)
  const [position, setPosition] = useState(watermark.position)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [darkBg, setDarkBg]     = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    getWatermarkUrl(watermark.r2_key).then(setPreviewUrl)
  }, [watermark.r2_key])

  function handleImageLoad(e) {
    const brightness = getImageBrightness(e.target)
    setDarkBg(brightness > 180) // light watermark → dark background
  }

  function handleOpacityChange(val) {
    setOpacity(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdate(watermark.id, { opacity: val })
    }, 400)
  }

  function handlePositionChange(pos) {
    setPosition(pos)
    onUpdate(watermark.id, { position: pos })
  }

  function handleLabelBlur() {
    if (label !== watermark.label) onUpdate(watermark.id, { label })
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: isActive ? '2px solid #6366f1' : '2px solid var(--border)', background: 'var(--surface)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          aria-label="Watermark label"
          className="text-sm font-medium bg-transparent outline-none"
          style={{ color: 'var(--text)' }} />
        <div className="flex items-center gap-2">
          {isActive
            ? <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Active</span>
            : <button onClick={() => onSetActive(watermark.id)}
                className="text-xs flex items-center gap-1"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                <StarOff size={13} /> Set active
              </button>
          }
          <button onClick={() => onDelete(watermark.id)}
            style={{ color: 'var(--text-muted)', padding: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Preview — background auto-switches based on watermark brightness */}
      <div className="px-5 py-4 flex items-center justify-center transition-colors duration-300"
        style={{
          background: darkBg ? '#1a1a1a' : 'var(--bg-subtle)',
          minHeight: 100,
          borderBottom: '1px solid var(--border)',
        }}>
        {previewUrl
          ? <img
              src={previewUrl}
              alt="Watermark preview"
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain', opacity }}
            />
          : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading preview…</span>
        }
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Opacity</label>
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={opacity}
            onChange={e => handleOpacityChange(parseFloat(e.target.value))}
            aria-label="Watermark opacity"
            className="w-full accent-indigo-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Position</label>
          <div className="grid grid-cols-3 gap-1.5">
            {POSITIONS.map(p => (
              <button key={p.id} onClick={() => handlePositionChange(p.id)}
                aria-label={`Position: ${p.label}`}
                aria-pressed={position === p.id}
                className="text-xs py-1.5 px-2 rounded-lg transition-all"
                style={{
                  border: position === p.id ? '1.5px solid #6366f1' : '1.5px solid var(--border)',
                  background: position === p.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-subtle)',
                  color: position === p.id ? '#6366f1' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
