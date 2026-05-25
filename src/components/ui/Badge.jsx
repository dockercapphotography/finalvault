export default function Badge({ children, variant = 'default' }) {
  const styles = {
    default: { background: 'var(--surface-raised)', color: 'var(--text-secondary)' },
    success: { background: 'var(--success-subtle)', color: 'var(--success)' },
    warning: { background: 'var(--warning-subtle)', color: 'var(--warning)' },
    danger: { background: 'var(--danger-subtle)', color: 'var(--danger)' },
  }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
      style={styles[variant] || styles.default}
    >
      {children}
    </span>
  )
}
