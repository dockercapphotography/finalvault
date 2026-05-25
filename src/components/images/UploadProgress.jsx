import { CheckCircle, AlertCircle, Loader } from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function UploadProgress({ items }) {
  const total = items.length
  const done = items.filter(i => i.status === 'done' || i.status === 'error').length
  const errors = items.filter(i => i.status === 'error').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Overall progress bar */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Uploading {total} {total === 1 ? 'image' : 'images'}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="w-full rounded-full h-1.5 overflow-hidden"
          style={{ background: 'var(--surface-raised)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: errors > 0 ? 'var(--warning)' : 'var(--accent)'
            }}
          />
        </div>
        {errors > 0 && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>
            {errors} {errors === 1 ? 'file' : 'files'} failed
          </p>
        )}
      </div>

      {/* Per-file list */}
      <div className="divide-y max-h-64 overflow-y-auto"
        style={{ '--tw-divide-opacity': 1, borderColor: 'var(--border)' }}>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="shrink-0">
              {item.status === 'done' && <CheckCircle size={15} style={{ color: 'var(--success)' }} />}
              {item.status === 'error' && <AlertCircle size={15} style={{ color: 'var(--danger)' }} />}
              {(item.status === 'processing' || item.status === 'uploading') && (
                <Loader size={15} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              )}
              {item.status === 'pending' && (
                <div className="w-4 h-4 rounded-full" style={{ background: 'var(--border)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate font-medium" style={{ color: 'var(--text)' }}>
                {item.name}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {item.status === 'pending' && 'Waiting...'}
                {item.status === 'processing' && 'Generating preview...'}
                {item.status === 'uploading' && 'Uploading...'}
                {item.status === 'done' && item.size ? formatBytes(item.size) : ''}
                {item.status === 'error' && (item.error || 'Failed')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
