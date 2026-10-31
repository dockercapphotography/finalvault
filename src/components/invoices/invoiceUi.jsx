// Shared pieces for the invoice screens (v1.6.0). Styling follows the app's
// existing conventions: SectionCard's rounded-2xl card with a 14px header,
// and PaymentBadge's `color + '18'` pill fill.

import { INVOICE_STATUS_STYLES, PAYMENT_STATUS_STYLES } from '../../utils/invoiceApi.js'

export const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--surface)',
  border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8,
  padding: '8px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
}

export const smallInputStyle = { ...inputStyle, padding: '6px 8px', fontSize: 13 }

export function focusBorder(e) { e.target.style.borderColor = 'var(--border-strong)' }
export function blurBorder(e) { e.target.style.borderColor = 'var(--border)' }

export function Card({ title, action, icon, children, testId }) {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} data-testid={testId}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)', margin: 0 }}>{title}{icon}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Pill({ label, color, testId }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ background: color + '18', color }} data-testid={testId}>{label}</span>
  )
}

export function InvoiceStatusPill({ status }) {
  const s = INVOICE_STATUS_STYLES[status] || INVOICE_STATUS_STYLES.draft
  return <Pill label={s.label} color={s.color} testId="invoice-status" />
}

export function PaymentStatusPill({ status, label }) {
  const s = PAYMENT_STATUS_STYLES[status] || PAYMENT_STATUS_STYLES.unpaid
  return <Pill label={label || s.label} color={s.color} testId="invoice-payment-status" />
}

// "$" prefixed money field. value/onChange are the typed text.
export function MoneyInput({ value, onChange, ariaLabel, disabled, width, small, testId, invalid }) {
  const base = small ? smallInputStyle : inputStyle
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: width || '100%' }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: small ? 9 : 10, top: '50%', transform: 'translateY(-50%)', fontSize: small ? 13 : 14, color: 'var(--text-muted)' }}>$</span>
      <input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}
        disabled={disabled} data-testid={testId}
        style={{ ...base, paddingLeft: small ? 20 : 22, textAlign: 'right', borderColor: invalid ? 'var(--danger)' : 'var(--border)', opacity: disabled ? 0.6 : 1 }}
        onFocus={focusBorder} onBlur={e => { e.target.style.borderColor = invalid ? 'var(--danger)' : 'var(--border)' }} />
    </span>
  )
}

// Locked padlock used in card headers and rows.
export function LockIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label="Locked" style={{ color: 'var(--text-muted)' }}>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
