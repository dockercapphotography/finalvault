export default function SettingsRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4"
      style={{ background: 'var(--surface)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <div className="shrink-0">
        {children}
      </div>
    </div>
  )
}
