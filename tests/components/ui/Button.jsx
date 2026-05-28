export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, className = '', type = 'button'
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm'

  const styles = {
    primary:   { background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', cursor: disabled ? 'not-allowed' : 'pointer' },
    ghost:     { background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' },
    danger:    { background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)', cursor: disabled ? 'not-allowed' : 'pointer' },
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2',
    lg: 'px-5 py-2.5',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  )
}
