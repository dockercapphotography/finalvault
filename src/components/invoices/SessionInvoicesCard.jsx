import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { Pill } from './invoiceUi.jsx'
import { getSessionInvoices, formatMoney, formatInvoiceDate, INVOICE_STATUS_STYLES, PAYMENT_STATUS_STYLES } from '../../utils/invoiceApi.js'

// ── Session Detail: Invoices card (v1.6.0) ───────────────────────────────
// Replaces the old Financials card. Lists every invoice on the session
// (retainer, final balance, later add-ons...) with where each one stands.
// "New invoice" opens the editor with this session and its client filled in.

function statusPill(inv) {
  if (inv.status === 'void') return <Pill label="Void" color={INVOICE_STATUS_STYLES.void.color} />
  // A draft with money logged (e.g. paid in cash, never sent) shows what was
  // paid first; "Not sent" just says the client can't see it.
  if (inv.status === 'draft') {
    if (Number(inv.amount_paid) > 0) {
      return (
        <span className="flex items-center gap-1.5">
          {paymentPill(inv)}
          <Pill label="Not sent" color={INVOICE_STATUS_STYLES.draft.color} />
        </span>
      )
    }
    return <Pill label="Draft" color={INVOICE_STATUS_STYLES.draft.color} />
  }
  return paymentPill(inv)
}

function paymentPill(inv) {
  if (inv.is_overdue) return <Pill label={`Overdue · ${formatMoney(inv.balance_due)} due`} color="#ef4444" />
  if (inv.payment_status === 'paid') return <Pill label="Paid" color={PAYMENT_STATUS_STYLES.paid.color} />
  if (inv.payment_status === 'partial') return <Pill label={`Partial · ${formatMoney(inv.amount_paid)} of ${formatMoney(inv.total)}`} color={PAYMENT_STATUS_STYLES.partial.color} />
  return <Pill label={`${formatMoney(inv.balance_due)} due`} color={PAYMENT_STATUS_STYLES.unpaid.color} />
}

export default function SessionInvoicesCard({ session }) {
  const [invoices, setInvoices] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getSessionInvoices(session.id)
      .then(rows => { if (!cancelled) setInvoices(rows) })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load invoices.') })
    return () => { cancelled = true }
  }, [session.id])

  const canCreate = Boolean(session.client_id)
  const newHref = `/invoices/new?client=${session.client_id || ''}&session=${session.id}`

  const action = canCreate ? (
    <Link to={newHref} data-testid="session-new-invoice"
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
      style={{ background: '#6366f1', color: '#fff', textDecoration: 'none' }}>
      <Plus size={12} />New invoice
    </Link>
  ) : null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }} data-testid="session-invoices-card">
      <div className="flex items-center justify-between px-5 py-3.5" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Invoices</h2>
        {action}
      </div>
      <div style={{ background: 'var(--surface)' }}>
        {error ? (
          <p className="px-5 py-4 text-sm" style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>
        ) : invoices === null ? null : invoices.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-sm" style={{ margin: 0, color: 'var(--text-muted)' }}>
              {canCreate ? 'No invoices yet.' : 'Link a client to this session to create an invoice.'}
            </p>
          </div>
        ) : (
          invoices.map((inv, i) => (
            <Link key={inv.id} to={`/invoices/${inv.id}`} data-testid="session-invoice-row"
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', textDecoration: 'none', opacity: inv.status === 'void' ? 0.6 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ margin: 0, color: 'var(--text)', textDecoration: inv.status === 'void' ? 'line-through' : 'none' }}>
                  <span className="font-medium">#{inv.invoice_number}</span>
                  {inv.first_line ? ` · ${inv.first_line}` : ''}
                  {inv.line_count > 1 ? <span style={{ color: 'var(--text-muted)' }}> +{inv.line_count - 1} more</span> : null}
                </p>
                <p className="text-xs" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                  {formatMoney(inv.total)}
                  {inv.status === 'sent' && inv.payment_status !== 'paid' && inv.next_due_date ? ` · Due ${formatInvoiceDate(inv.next_due_date)}` : ''}
                </p>
              </div>
              <span className="shrink-0">{statusPill(inv)}</span>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
