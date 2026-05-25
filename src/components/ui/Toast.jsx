import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

export default function Toast({ message, type = 'success', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  const styles = {
    success: { icon: CheckCircle, class: 'bg-green-500/10 border-green-500/30 text-green-400' },
    error: { icon: XCircle, class: 'bg-red-500/10 border-red-500/30 text-red-400' },
    info: { icon: AlertCircle, class: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
  }

  const { icon: Icon, class: cls } = styles[type] || styles.info

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${cls} shadow-lg`}>
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  )
}
