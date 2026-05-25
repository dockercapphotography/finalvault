export default function Input({
  label, value, onChange, placeholder = '', type = 'text',
  required = false, disabled = false, hint = '', error = ''
}) {
  const inputStyle = {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '8px', padding: '9px 12px',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.15s',
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </label>
      )}
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ ...inputStyle, borderColor: error ? 'var(--danger)' : 'var(--border)' }}
          onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
          onBlur={e => e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)'}
        />
      )}
      {hint && !error && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
      )}
    </div>
  )
}
