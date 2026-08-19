import { useEffect, useState } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock.js'

// PickerModal — a centered, reliable "pick one from a flat list" modal.
// Same visual language as MovePickerModal (header, list, Cancel), but
// generic and single-step: tapping an option fires it immediately and
// closes, no separate confirm button. MovePickerModal's browse-then-
// confirm flow is specific to hierarchical folder navigation; this is
// for the simpler flat-list case (e.g. PortalMenu submenus like
// "Move to Set" or "Download" -> Web Size/Original).
//
// title:    header text (e.g. the parent menu item's label)
// subtitle: optional context line (e.g. "Moving: IMG_1234.jpg")
// options:  [{ label, icon?, onClick }]
export default function PickerModal({ open, onClose, title, subtitle, options = [] }) {
  const [visible, setVisible] = useState(false)
  useScrollLock(open)

  useEffect(() => {
    if (open) requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    else setVisible(false)
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', transition: 'background 0.2s ease', backdropFilter: visible ? 'blur(2px)' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 z-50 w-full"
        style={{
          top: '50%',
          transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          maxWidth: 360,
          padding: '0 16px',
        }}
      >
        <div data-testid="picker-modal" className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
            {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {options.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => { opt.onClick?.(); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                style={{ borderBottom: i < options.length - 1 ? '1px solid var(--border)' : 'none', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {opt.icon && <span style={{ color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>{opt.icon}</span>}
                <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
