import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePortalData } from '../hooks/usePortalData.js'
import { invoicesOf, needsPayment, invoiceTitle, paymentMethodLabel, nextAmountText } from '../utils/portalInvoices.js'
import { formatMoney, formatUnitPrice, formatInvoiceDate, todayIso } from '../utils/invoiceApi.js'
import { PortalScreens, InvoicePortalLayout, PayAction, StatusText } from '../components/invoices/PortalInvoiceParts.jsx'

// ── Client Portal: one invoice (v1.6.0) ──────────────────────────────────
// Reads the same cached portal payload as the list, so it only ever shows
// this client's sent invoices.

const longDate = d => formatInvoiceDate(d, { month: 'short', day: 'numeric', year: 'numeric' })

function Section({ title, children, testId }) {
  return (
    <section className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} data-testid={testId}>
      {title && (
        <p className="text-xs font-medium px-4 pt-3 pb-2" style={{ color: 'var(--text-muted)' }}>{title}</p>
      )}
      {children}
    </section>
  )
}

function TotalRow({ label, value, strong, muted }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm" style={{ padding: '3px 0' }}>
      <span style={{ color: muted ? 'var(--text-muted)' : 'var(--text-secondary)', fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: strong ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function installmentStatus(row) {
  if (row.row_status === 'paid') return { label: 'Paid', color: '#15803d' }
  if (row.due_date && row.due_date < todayIso()) return { label: 'Overdue', color: '#dc2626' }
  if (row.row_status === 'partial') return { label: 'Partly paid', color: '#c2410c' }
  return { label: 'Due', color: '#d97706' }
}

function rate(value) {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })}%`
}

function InvoiceBody({ inv, token }) {
  const due = needsPayment(inv)
  const schedule = inv.schedule || []
  const payments = inv.payments || []
  const hasDiscount = Number(inv.discount_amount) > 0
  const hasTax = Number(inv.tax_amount) > 0

  return (
    <div className="space-y-4" style={{ maxWidth: 560 }} data-testid="portal-invoice-detail">
      <Link to={`/client/${token}/invoices`} className="flex items-center gap-2 text-sm"
        style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
        <ArrowLeft size={15} />Invoices
      </Link>

      {/* Header + what's owed */}
      <div className="rounded-xl px-4 py-4"
        style={due
          ? { background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.25)' }
          : { background: 'rgba(34,153,84,0.06)', border: '1px solid rgba(34,153,84,0.2)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{invoiceTitle(inv)}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Invoice #{inv.invoice_number}{inv.sent_at ? ` · Sent ${longDate(inv.sent_at)}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }} data-testid="portal-invoice-amount">
              {due ? `${nextAmountText(inv)} due` : formatMoney(inv.total)}
            </p>
            <p className="text-xs mt-0.5"><StatusText inv={inv} /></p>
          </div>
        </div>
        {due && inv.next_due_date && (
          <p className="text-xs mt-2" style={{ color: inv.is_overdue ? '#dc2626' : '#b07a1f' }}>
            {inv.is_overdue ? 'Was due' : 'Due'} {longDate(inv.next_due_date)}
            {Number(inv.next_amount) < Number(inv.balance_due) ? ` · ${formatMoney(inv.balance_due)} left in total` : ''}
          </p>
        )}
        {due && <div className="mt-3"><PayAction inv={inv} /></div>}
      </div>

      {/* Line items + totals */}
      <Section title="Items" testId="portal-invoice-items">
        {(inv.line_items || []).map((li, i) => {
          const qty = Number(li.quantity)
          const showMath = qty !== 1 || li.unit_label
          return (
            <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{li.title}</p>
                {li.description && <p className="text-xs mt-0.5 whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{li.description}</p>}
                {showMath && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} × {formatUnitPrice(li.unit_price, li.unit_label)}
                  </p>
                )}
              </div>
              <span className="text-sm shrink-0" style={{ color: 'var(--text)' }}>{formatMoney(li.line_total)}</span>
            </div>
          )
        })}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
          {(hasDiscount || hasTax) && <TotalRow label="Subtotal" value={formatMoney(inv.subtotal)} />}
          {hasDiscount && <TotalRow label={`Discount (${rate(inv.discount_rate)})`} value={`−${formatMoney(inv.discount_amount)}`} />}
          {hasTax && <TotalRow label={`Tax (${rate(inv.tax_rate)})`} value={formatMoney(inv.tax_amount)} />}
          <TotalRow label="Total" value={formatMoney(inv.total)} strong />
          {Number(inv.amount_paid) > 0 && <TotalRow label="Paid" value={`−${formatMoney(inv.amount_paid)}`} muted />}
          {Number(inv.amount_paid) > 0 && <TotalRow label="Balance due" value={formatMoney(inv.balance_due)} strong />}
        </div>
      </Section>

      {/* Payment schedule */}
      {schedule.length > 1 && (
        <Section title="Payment schedule" testId="portal-invoice-schedule">
          {schedule.map(row => {
            const st = installmentStatus(row)
            return (
              <div key={row.sequence} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text)' }}>Payment {row.sequence}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {row.due_date ? `Due ${longDate(row.due_date)}` : 'No due date'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{formatMoney(row.amount)}</p>
                  <p className="text-xs mt-0.5" style={{ color: st.color, fontWeight: 500 }}>{st.label}</p>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      {/* Payments received */}
      {payments.length > 0 && (
        <Section title="Payments received" testId="portal-invoice-payments">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                {longDate(p.paid_date)}
                {paymentMethodLabel(p.method) && <span style={{ color: 'var(--text-muted)' }}> · {paymentMethodLabel(p.method)}</span>}
              </span>
              <span className="text-sm shrink-0" style={{ color: 'var(--text)' }}>{formatMoney(p.amount)}</span>
            </div>
          ))}
        </Section>
      )}

      {inv.notes && (
        <Section title="Notes">
          <p className="text-sm px-4 pb-3 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{inv.notes}</p>
        </Section>
      )}
    </div>
  )
}

export default function ClientPortalInvoiceDetail() {
  const { token, invoiceId } = useParams()
  const portal = usePortalData(token)

  return (
    <PortalScreens token={token} portal={portal}>
      {data => {
        const inv = invoicesOf(data).find(i => i.id === invoiceId)
        return (
          <InvoicePortalLayout token={token} data={data}>
            {inv ? <InvoiceBody inv={inv} token={token} /> : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Invoice not found</p>
                <Link to={`/client/${token}/invoices`} className="text-sm mt-2" style={{ color: '#6366f1' }}>
                  Back to Invoices
                </Link>
              </div>
            )}
          </InvoicePortalLayout>
        )
      }}
    </PortalScreens>
  )
}
