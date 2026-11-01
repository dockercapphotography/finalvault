import { useParams } from 'react-router-dom'
import { usePortalData } from '../hooks/usePortalData.js'
import { invoicesOf, needsPayment } from '../utils/portalInvoices.js'
import { formatMoney } from '../utils/invoiceApi.js'
import {
  PortalScreens, InvoicePortalLayout, DueInvoiceCard, PaidInvoiceRow, EmptyInvoices,
} from '../components/invoices/PortalInvoiceParts.jsx'

// ── Client Portal: Invoices list (v1.6.0) ────────────────────────────────
// Sent invoices only (drafts and voids never reach the portal). Grouped
// like Contracts: what still needs paying first, then what's paid.

export default function ClientPortalInvoices() {
  const { token } = useParams()
  const portal = usePortalData(token)

  return (
    <PortalScreens token={token} portal={portal}>
      {data => {
        const invoices = invoicesOf(data)
        const due = invoices.filter(needsPayment)
          .sort((a, b) => (a.next_due_date || '9999') < (b.next_due_date || '9999') ? -1 : 1)
        const paid = invoices.filter(i => !needsPayment(i))
        const owed = due.reduce((sum, i) => sum + Math.round(Number(i.balance_due) * 100), 0) / 100

        return (
          <InvoicePortalLayout token={token} data={data}>
            <div className="space-y-5" style={{ maxWidth: 560 }} data-testid="portal-invoices">
              <div>
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Invoices</h1>
                {due.length > 0 && (
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatMoney(owed)} left to pay across {due.length} {due.length === 1 ? 'invoice' : 'invoices'}
                  </p>
                )}
              </div>

              {invoices.length === 0 ? <EmptyInvoices /> : (
                <>
                  {due.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: '#d97706' }}>Needs payment</p>
                      <div className="space-y-2">
                        {due.map(inv => <DueInvoiceCard key={inv.id} inv={inv} token={token} />)}
                      </div>
                    </div>
                  )}
                  {paid.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Paid</p>
                      <div className="space-y-2">
                        {paid.map(inv => <PaidInvoiceRow key={inv.id} inv={inv} token={token} />)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </InvoicePortalLayout>
        )
      }}
    </PortalScreens>
  )
}
