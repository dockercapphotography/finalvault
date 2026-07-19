import { useState } from 'react'
import { RefreshCw, Copy, Eye, EyeOff } from 'lucide-react'

// Shared plain-text-by-default secret field (password/PIN display + edit).
// Extracted from GallerySettings.jsx so other secret-entry UIs (e.g. the
// client portal password in ClientDetail.jsx) render identically instead
// of re-implementing the same input+icon-row pattern.
export default function PlainField({ label, value, onChange, onRefresh, onCopy, placeholder, hint, maxLength, type = 'text' }) {
  const [show, setShow] = useState(true)
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{label}</label>}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => {
            const v = maxLength ? e.target.value.slice(0, maxLength) : e.target.value
            onChange(type === 'pin' ? v.replace(/[^0-9]/g, '') : v)
          }}
          placeholder={placeholder}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', borderRadius: '8px', padding: '9px 80px 9px 12px',
            fontSize: '14px', outline: 'none',
            fontFamily: type === 'pin' ? 'monospace' : 'inherit',
            letterSpacing: type === 'pin' ? '0.2em' : 'normal',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {onRefresh && (
            <button type="button" onClick={onRefresh} title="Generate new"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <RefreshCw size={14} />
            </button>
          )}
          {onCopy && value && (
            <button type="button" onClick={() => navigator.clipboard.writeText(value)} title="Copy"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              <Copy size={14} />
            </button>
          )}
          <button type="button" onClick={() => setShow(!show)}
            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}
