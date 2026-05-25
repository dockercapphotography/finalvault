export default function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-800 text-slate-400',
    success: 'bg-green-500/10 text-green-400',
    warning: 'bg-amber-500/10 text-amber-400',
    danger: 'bg-red-500/10 text-red-400',
    info: 'bg-blue-500/10 text-blue-400',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
