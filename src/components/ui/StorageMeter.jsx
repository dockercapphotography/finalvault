import { formatBytes } from '../../utils/formatters.js'

export default function StorageMeter({ used, total }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const isWarning = pct > 80
  const isCritical = pct > 95

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(total)} total</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCritical ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-slate-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
