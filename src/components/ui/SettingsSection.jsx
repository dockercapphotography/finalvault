export default function SettingsSection({ title, description, action, children }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}>
      {(title || description) && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>{title}</h3>}
              {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </div>
      )}
      <div className="divide-y" style={{ '--tw-divide-color': 'var(--border)' }}>
        {children}
      </div>
    </div>
  )
}
