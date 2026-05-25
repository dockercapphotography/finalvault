import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

export default function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const config = {
    success: { icon: CheckCircle, bg: 'var(--success-subtle)', color: 'var(--success)' },
    error:   { icon: XCircle,    bg: 'var(--danger-subtle)',  color: 'var(--danger)' },
    info:    { icon: AlertCircle, bg: 'var(--surface-raised)', color: 'var(--text-secondary)' },
  }
  const { icon: Icon, bg, color } = config[type] || config.info

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm shadow-lg"
      style={{ background: bg, color, border: `1px solid ${color}40` }}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}
