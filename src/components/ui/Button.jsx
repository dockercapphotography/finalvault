export default function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button'
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-white text-slate-900 hover:bg-slate-100',
    secondary: 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700',
    ghost: 'text-slate-400 hover:text-white hover:bg-slate-800',
    danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30',
  }

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-sm px-5 py-2.5',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}
