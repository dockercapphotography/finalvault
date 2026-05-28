export default function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className="w-8 h-4 rounded-full transition-colors"
          style={{ background: checked ? 'var(--accent)' : 'var(--border-strong)' }}
        />
        <div
          className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
          style={{
            background: checked ? 'var(--accent-fg)' : 'var(--surface)',
            left: checked ? '17px' : '2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }}
        />
      </div>
      {(label || description) && (
        <div>
          {label && <p className="text-sm" style={{ color: 'var(--text)' }}>{label}</p>}
          {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
        </div>
      )}
    </label>
  )
}
