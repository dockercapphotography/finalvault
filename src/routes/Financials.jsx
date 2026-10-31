import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Download, Receipt, ChevronRight } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import Button from '../components/ui/Button.jsx'
import { Pill } from '../components/invoices/invoiceUi.jsx'
import ExportPaymentsModal from '../components/invoices/ExportPaymentsModal.jsx'
import { formatMoney, formatInvoiceDate, todayIso } from '../utils/invoiceApi.js'
import { getFinancials, financialStatus, inDateFilter, DATE_PRESETS } from '../utils/financialsApi.js'

// ── Financials (v1.6.0) ──────────────────────────────────────────────────
// Every invoice in one place: what's been collected this year, what's
// still owed, what's overdue, and the full invoice list with filters.

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: '#6b7280' },
  { value: 'unpaid', label: 'Unpaid', color: '#ef4444' },
  { value: 'partial', label: 'Partly paid', color: '#f97316' },
  { value: 'overdue', label: 'Overdue', color: '#ef4444' },
  { value: 'paid', label: 'Paid', color: '#10b981' },
  { value: 'void', label: 'Void', color: '#6b7280' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'due', label: 'Due soonest' },
  { value: 'balance', label: 'Balance: high → low' },
  { value: 'total', label: 'Total: high → low' },
  { value: 'client', label: 'Client: A → Z' },
]

// Status filter keys an invoice matches: drafts and voids only match
// themselves; a sent invoice matches its payment status, plus "overdue".
function statusKeys(row) {
  if (row.status === 'draft') return ['draft']
  if (row.status === 'void') return ['void']
  return row.is_overdue ? [row.payment_status, 'overdue'] : [row.payment_status]
}

function cents(n) { return Math.round(Number(n || 0) * 100) }

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}` }

function SummaryCard({ label, value, detail, tone, onClick, active, testId }) {
  const clickable = Boolean(onClick)
  return (
    <button type="button" onClick={onClick} disabled={!clickable} data-testid={testId}
      className="rounded-2xl px-4 py-3.5 text-left transition-colors min-w-0"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
        boxShadow: active ? '0 0 0 1px var(--border-strong)' : 'none',
        cursor: clickable ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--surface-raised)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}>
      <p className="text-xs font-medium" style={{ margin: 0, color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xl font-semibold mt-1 truncate" style={{ margin: '4px 0 0', color: tone || 'var(--text)' }}>{value}</p>
      <p className="text-xs mt-0.5 truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>{detail}</p>
    </button>
  )
}

function InvoiceRow({ row, first, onOpen }) {
  const st = financialStatus(row)
  const isVoid = row.status === 'void'
  const showPaidPill = row.status === 'draft' && row.has_payments

  let rightDetail = null
  if (isVoid) rightDetail = <span style={{ color: 'var(--text-muted)' }}>Void</span>
  else if (row.payment_status === 'paid') rightDetail = <span style={{ color: '#10b981' }}>Paid in full</span>
  else if (row.status === 'draft') rightDetail = <span style={{ color: 'var(--text-muted)' }}>Not sent</span>
  else {
    rightDetail = (
      <span style={{ color: row.is_overdue ? '#ef4444' : 'var(--text-muted)' }}>
        {formatMoney(row.balance_due)} due{row.next_due_date ? ` ${formatInvoiceDate(row.next_due_date, { month: 'short', day: 'numeric' })}` : ''}
      </span>
    )
  }

  return (
    <button type="button" onClick={onOpen} data-testid="financials-invoice-row"
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
      style={{
        background: 'var(--surface)', cursor: 'pointer',
        borderTop: first ? 'none' : '1px solid var(--border)',
        borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
        opacity: isVoid ? 0.65 : 1,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
      <div className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center shrink-0"
        style={{ background: st.color + '18', color: st.color }}>
        <Receipt size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-medium text-sm truncate" style={{ margin: 0, color: 'var(--text)' }}>{row.client_display}</p>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>#{row.invoice_number}</span>
          <span className="shrink-0"><Pill label={st.label} color={st.color} /></span>
          {showPaidPill && (
            <span className="shrink-0 hidden sm:inline">
              <Pill label={row.payment_status === 'paid' ? 'Paid' : 'Partly paid'} color={row.payment_status === 'paid' ? '#10b981' : '#f97316'} />
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
          {row.session_name || 'Standalone invoice'} · {formatInvoiceDate(row.created_date)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-semibold" style={{ margin: 0, color: 'var(--text)', textDecoration: isVoid ? 'line-through' : 'none' }}>
          {formatMoney(row.total)}
        </p>
        <p className="text-xs mt-0.5" style={{ margin: '2px 0 0' }}>{rightDetail}</p>
      </div>
      <ChevronRight size={16} className="hidden md:block shrink-0" style={{ color: 'var(--text-muted)' }} />
    </button>
  )
}

export default function Financials() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState([])
  const [clientFilter, setClientFilter] = useState(null)
  const [dateFilter, setDateFilter] = useState(null)
  const [sortBy, setSortBy] = useState('newest')
  const [showExport, setShowExport] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFinancials()
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load invoices.') })
    return () => { cancelled = true }
  }, [])

  const loading = !data && !error
  const invoices = useMemo(() => data?.invoices ?? [], [data])
  const payments = useMemo(() => data?.payments ?? [], [data])

  const summary = useMemo(() => {
    const year = todayIso().slice(0, 4)
    const ytd = payments.filter(p => p.invoice_status !== 'void' && p.paid_date?.startsWith(year))
    const open = invoices.filter(r => r.status === 'sent' && r.balance_due > 0)
    const overdue = open.filter(r => r.is_overdue)
    const drafts = invoices.filter(r => r.status === 'draft')
    const sum = (list, f) => list.reduce((s, x) => s + cents(f(x)), 0) / 100
    return {
      year,
      collected: sum(ytd, p => p.amount), collectedCount: ytd.length,
      outstanding: sum(open, r => r.balance_due), openCount: open.length,
      overdue: sum(overdue, r => r.balance_due), overdueCount: overdue.length,
      drafts: sum(drafts, r => r.total), draftCount: drafts.length,
    }
  }, [invoices, payments])

  const clientOptions = useMemo(() => {
    const seen = new Map()
    for (const r of invoices) if (!seen.has(r.client_key)) seen.set(r.client_key, r.client_display)
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [invoices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '')
    const list = invoices.filter(r => {
      if (q && !(
        r.client_display.toLowerCase().includes(q) ||
        (r.client_email || '').toLowerCase().includes(q) ||
        (r.session_name || '').toLowerCase().includes(q) ||
        String(r.invoice_number).includes(q)
      )) return false
      if (statusFilter.length && !statusKeys(r).some(k => statusFilter.includes(k))) return false
      if (clientFilter && r.client_key !== clientFilter) return false
      if (!inDateFilter(r.created_date, dateFilter)) return false
      return true
    })
    const byNewest = (a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.invoice_number - a.invoice_number)
    return list.sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return -byNewest(a, b)
        case 'due': {
          // Open invoices with a due date first, soonest first; the rest after.
          const da = a.status !== 'void' && a.balance_due > 0 ? a.next_due_date : null
          const db = b.status !== 'void' && b.balance_due > 0 ? b.next_due_date : null
          if (da && db && da !== db) return da < db ? -1 : 1
          if (da && !db) return -1
          if (!da && db) return 1
          return byNewest(a, b)
        }
        case 'balance': return (b.status === 'void' ? 0 : b.balance_due) - (a.status === 'void' ? 0 : a.balance_due) || byNewest(a, b)
        case 'total': return b.total - a.total || byNewest(a, b)
        case 'client': return a.client_display.localeCompare(b.client_display) || byNewest(a, b)
        default: return byNewest(a, b)
      }
    })
  }, [invoices, search, statusFilter, clientFilter, dateFilter, sortBy])

  function clearAll() {
    setSearch('')
    setStatusFilter([])
    setClientFilter(null)
    setDateFilter(null)
  }

  function toggleQuickFilter(keys) {
    const same = statusFilter.length === keys.length && keys.every(k => statusFilter.includes(k))
    setStatusFilter(same ? [] : keys)
  }

  const isQuick = keys => statusFilter.length === keys.length && keys.every(k => statusFilter.includes(k))
  const hasInvoices = invoices.length > 0

  const subtitle = loading ? 'Loading…'
    : !hasInvoices ? 'No invoices yet'
    : summary.openCount > 0 ? `${formatMoney(summary.outstanding)} outstanding across ${plural(summary.openCount, 'invoice')}`
    : `${plural(invoices.length, 'invoice')} · nothing outstanding`

  return (
    <div className="space-y-5" data-testid="financials-page">
      <PageHeader
        title="Financials"
        subtitle={subtitle}
        search={hasInvoices ? { value: search, onChange: setSearch, placeholder: 'Search client, invoice # or session...' } : undefined}
        filterSections={hasInvoices ? [
          { key: 'status', label: 'Status', type: 'multiSelect', value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS },
          ...(clientOptions.length > 1 ? [{
            key: 'client', label: 'Client', type: 'select', value: clientFilter, onChange: setClientFilter, options: clientOptions,
          }] : []),
          { key: 'created', label: 'Created', type: 'dateRange', value: dateFilter, onChange: setDateFilter, presets: DATE_PRESETS },
          { key: 'sort', label: 'Sort by', type: 'sort', value: sortBy, onChange: setSortBy, options: SORT_OPTIONS },
        ] : undefined}
        onClearAllFilters={clearAll}
        primaryAction={{ label: 'New invoice', icon: Plus, onClick: () => navigate('/invoices/new') }}
        secondaryActions={payments.length > 0 ? [{ label: 'Export payments', icon: Download, onClick: () => setShowExport(true) }] : []}
      />

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          Failed to load invoices: {error}
        </div>
      )}

      {!loading && !error && !hasInvoices && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--surface-raised)' }}>
            <Receipt size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>No invoices yet</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Invoices you create from a session or here will show up in this list.</p>
          <Button onClick={() => navigate('/invoices/new')}><Plus size={15} />New invoice</Button>
        </div>
      )}

      {!loading && !error && hasInvoices && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="financials-summary">
            <SummaryCard label={`Collected in ${summary.year}`} value={formatMoney(summary.collected)}
              detail={plural(summary.collectedCount, 'payment')} tone="#10b981" testId="financials-collected"
              onClick={payments.length > 0 ? () => setShowExport(true) : undefined} />
            <SummaryCard label="Outstanding" value={formatMoney(summary.outstanding)}
              detail={plural(summary.openCount, 'sent invoice')} testId="financials-outstanding"
              onClick={() => toggleQuickFilter(['unpaid', 'partial'])} active={isQuick(['unpaid', 'partial'])} />
            <SummaryCard label="Overdue" value={formatMoney(summary.overdue)}
              detail={plural(summary.overdueCount, 'invoice')} tone={summary.overdueCount ? '#ef4444' : undefined} testId="financials-overdue"
              onClick={() => toggleQuickFilter(['overdue'])} active={isQuick(['overdue'])} />
            <SummaryCard label="Drafts" value={String(summary.draftCount)}
              detail={summary.draftCount ? `${formatMoney(summary.drafts)} not sent yet` : 'Nothing waiting'} testId="financials-drafts"
              onClick={() => toggleQuickFilter(['draft'])} active={isQuick(['draft'])} />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>No invoices match these filters.</p>
              <button onClick={clearAll} className="text-sm mt-2"
                style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }} data-testid="financials-list">
              {filtered.map((row, i) => (
                <InvoiceRow key={row.id} row={row} first={i === 0} onOpen={() => navigate(`/invoices/${row.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {showExport && <ExportPaymentsModal payments={payments} onClose={() => setShowExport(false)} />}
    </div>
  )
}
