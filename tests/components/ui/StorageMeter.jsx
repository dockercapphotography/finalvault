import { formatBytes } from '../../utils/formatters.js'

export default function StorageMeter({ used, total }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const isWarning = pct > 80
  const isCritical = pct > 95
  const barColor = isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--accent)'

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(total)} total</span>
      </div>
      <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  )
}
