import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Receipt, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react'
import ClientPortalLayout from '../layout/ClientPortalLayout.jsx'
import PortalPasswordGate from '../layout/PortalPasswordGate.jsx'
import { formatMoney } from '../../utils/invoiceApi.js'
import {
  clientPaymentLabel, invoiceTitle, needsPayment, payOption, nextAmountText, pendingInvoiceCount, shortDate,
} from '../../utils/portalInvoices.js'

// ── Client Portal invoice pieces (v1.6.0) ────────────────────────────────

const AMBER = '#d97706'

export function PortalNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          The link may have been regenerated. Contact your photographer for an updated link.
        </p>
      </div>
    </div>
  )
}

// Layout with every badge count worked out from the payload.
export function InvoicePortalLayout({ token, data, children }) {
  return (
    <ClientPortalLayout
      token={token}
      photographerId={data?.client?.photographer_id}
      pendingContracts={(data?.contracts || []).filter(c => c.status !== 'signed').length}
      pendingQuestionnaires={(data?.pending_questionnaires || []).length}
      pendingInvoices={pendingInvoiceCount(data)}
    >
      {children}
    </ClientPortalLayout>
  )
}

// Handles the loading / password / not-found screens for a usePortalData
// result; renders children(data) once the payload is ready.
export function PortalScreens({ token, portal, children }) {
  if (portal.status === 'notFound') return <PortalNotFound />
  if (portal.status === 'gate') {
    return <PortalPasswordGate token={token} gateResult={portal.gateResult} onUnlock={portal.unlock} />
  }
  if (portal.status !== 'ready') {
    return (
      <ClientPortalLayout token={token} pendingContracts={0} pendingQuestionnaires={0}>
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      </ClientPortalLayout>
    )
  }
  return children(portal.data)
}

export function StatusText({ inv }) {
  const s = clientPaymentLabel(inv)
  return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>
}

// The Pay action: a button to the photographer's payment page (amount
// filled in where the platform allows), or a Zelle address to copy.
export function PayAction({ inv, compact = false }) {
  const [copied, setCopied] = useState(false)
  const option = payOption(inv)
  if (!option) return null
  const amount = nextAmountText(inv)

  if (option.kind === 'link') {
    return (
      <a href={option.href} target="_blank" rel="noopener noreferrer" data-testid="portal-pay-link"
        className="flex items-center justify-center gap-2 w-full rounded-lg text-sm font-medium"
        style={{ background: AMBER, color: '#fff', textDecoration: 'none', padding: compact ? '9px 12px' : '11px 14px' }}
        onClick={e => e.stopPropagation()}>
        Pay {amount} with {option.label}
        <ExternalLink size={14} />
      </a>
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(option.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the address is on screen to copy by hand.
    }
  }

  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#fff', border: '1px solid rgba(217,119,6,0.3)' }}
      data-testid="portal-pay-text" onClick={e => e.stopPropagation()}>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Send {amount} with {option.label} to</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-sm font-medium flex-1 min-w-0 break-all" style={{ color: 'var(--text)' }}>{option.value}</span>
        <button type="button" onClick={copy} aria-label="Copy"
          className="flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 shrink-0"
          style={{ background: 'rgba(217,119,6,0.1)', color: AMBER, border: 'none', cursor: 'pointer' }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function dueLine(inv) {
  const parts = [`Invoice #${inv.invoice_number}`]
  if (needsPayment(inv) && inv.next_due_date) {
    parts.push(`${inv.is_overdue ? 'Was due' : 'Due'} ${shortDate(inv.next_due_date)}`)
  }
  return parts.join(' · ')
}

// "Needs payment" card: amber, with the amount due and the Pay action.
export function DueInvoiceCard({ inv, token }) {
  const partOfSchedule = (inv.schedule || []).length > 1 && Number(inv.next_amount) < Number(inv.balance_due)
  return (
    <div className="rounded-xl px-4 py-3.5" data-testid="portal-invoice-due"
      style={{ background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.25)' }}>
      <Link to={`/client/${token}/invoices/${inv.id}`} className="flex items-start gap-3" style={{ textDecoration: 'none' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{invoiceTitle(inv)}</p>
          <p className="text-xs mt-0.5" style={{ color: inv.is_overdue ? '#dc2626' : '#b07a1f' }}>{dueLine(inv)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{nextAmountText(inv)} due</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {partOfSchedule ? `of ${formatMoney(inv.balance_due)} left` : <StatusText inv={inv} />}
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
      </Link>
      <div className="mt-3"><PayAction inv={inv} compact /></div>
    </div>
  )
}

export function PaidInvoiceRow({ inv, token }) {
  const lastPaid = (inv.payments || []).map(p => p.paid_date).sort().pop()
  return (
    <Link to={`/client/${token}/invoices/${inv.id}`} data-testid="portal-invoice-paid"
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ border: '1px solid var(--border)', textDecoration: 'none' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,153,84,0.08)' }}>
        <CheckCircle size={16} style={{ color: '#15803d' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{invoiceTitle(inv)}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Invoice #{inv.invoice_number}{lastPaid ? ` · Paid ${shortDate(lastPaid)}` : ''}
        </p>
      </div>
      <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text)' }}>{formatMoney(inv.total)}</span>
      <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
    </Link>
  )
}

export function EmptyInvoices() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Receipt size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No invoices yet</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
        Invoices will show up here once your photographer sends one.
      </p>
    </div>
  )
}
