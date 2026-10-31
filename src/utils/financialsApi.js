import { supabase } from '../supabaseClient.js'
import { PAYMENT_METHODS, INVOICE_STATUS_STYLES, PAYMENT_STATUS_STYLES } from './invoiceApi.js'

// ── Financials page data (v1.6.0) ────────────────────────────────────────
// Every invoice with its totals (sql/108 invoice_totals), plus every logged
// payment for "Collected" and the payments export. All reads go through
// RLS, so a photographer only ever sees their own rows.

// PostgREST returns at most 1,000 rows per request; page through so a
// busy account never silently loses older invoices or payments.
async function selectAll(build) {
  const size = 1000
  const out = []
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) return out
  }
}

function localDateIso(ts) {
  if (!ts) return null
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getFinancials() {
  const [invoices, totals, payments, clients, sessions] = await Promise.all([
    selectAll(() => supabase.from('invoices')
      .select('id, invoice_number, status, client_id, client_name, client_email, session_id, due_date, sent_at, created_at')
      .order('id')),
    selectAll(() => supabase.from('invoice_totals')
      .select('invoice_id, total, amount_paid, balance_due, payment_status, has_payments, next_due_date, is_overdue')
      .order('invoice_id')),
    selectAll(() => supabase.from('invoice_payments')
      .select('id, invoice_id, amount, paid_date, method, note')
      .order('id')),
    selectAll(() => supabase.from('clients').select('id, first_name, last_name').order('id')),
    selectAll(() => supabase.from('sessions').select('id, name').order('id')),
  ])

  const totalsById = Object.fromEntries(totals.map(t => [t.invoice_id, t]))
  const clientsById = Object.fromEntries(clients.map(c => [c.id, c]))
  const sessionsById = Object.fromEntries(sessions.map(s => [s.id, s]))

  const rows = invoices.map(inv => {
    const t = totalsById[inv.id] || {}
    const c = inv.client_id ? clientsById[inv.client_id] : null
    const liveName = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : ''
    return {
      ...inv,
      client_display: liveName || inv.client_name || inv.client_email || 'No client',
      // Groups the client filter; a deleted client keeps its snapshot name.
      client_key: inv.client_id || `name:${inv.client_name || inv.client_email || ''}`,
      session_name: inv.session_id ? (sessionsById[inv.session_id]?.name || 'Session') : null,
      created_date: localDateIso(inv.created_at),
      total: Number(t.total || 0),
      amount_paid: Number(t.amount_paid || 0),
      balance_due: Number(t.balance_due || 0),
      payment_status: t.payment_status || 'unpaid',
      has_payments: Boolean(t.has_payments),
      next_due_date: t.next_due_date || inv.due_date || null,
      is_overdue: Boolean(t.is_overdue),
    }
  })

  const rowsById = Object.fromEntries(rows.map(r => [r.id, r]))
  const paymentRows = payments
    .map(p => {
      const inv = rowsById[p.invoice_id]
      return inv ? {
        ...p,
        amount: Number(p.amount),
        invoice_number: inv.invoice_number,
        invoice_status: inv.status,
        client_display: inv.client_display,
        client_email: inv.client_email,
        session_name: inv.session_name,
      } : null
    })
    .filter(Boolean)

  return { invoices: rows, payments: paymentRows }
}

// One label for the list and the export: Draft, Void, Overdue, or the
// payment status of a sent invoice.
export function financialStatus(row) {
  if (row.status === 'draft') return { key: 'draft', ...INVOICE_STATUS_STYLES.draft }
  if (row.status === 'void') return { key: 'void', ...INVOICE_STATUS_STYLES.void }
  if (row.is_overdue) return { key: 'overdue', label: 'Overdue', color: '#ef4444' }
  return { key: row.payment_status, ...PAYMENT_STATUS_STYLES[row.payment_status] }
}

// ── Payments CSV ─────────────────────────────────────────────────────

function csvCell(value) {
  let s = value == null ? '' : String(value)
  // Spreadsheet apps run cells that start with these as formulas; client
  // names and notes can come from outside, so neutralize them.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map(m => [m.id, m.label]))

export function buildPaymentsCsv(payments) {
  const header = ['Date paid', 'Client', 'Client email', 'Invoice #', 'Session', 'Amount', 'Method', 'Note', 'Invoice status']
  const lines = [...payments]
    .sort((a, b) => (a.paid_date < b.paid_date ? -1 : a.paid_date > b.paid_date ? 1 : a.invoice_number - b.invoice_number))
    .map(p => [
      p.paid_date,
      p.client_display,
      p.client_email || '',
      p.invoice_number,
      p.session_name || '',
      p.amount.toFixed(2),
      METHOD_LABELS[p.method] || '',
      p.note || '',
      INVOICE_STATUS_STYLES[p.invoice_status]?.label || p.invoice_status,
    ].map(csvCell).join(','))
  // BOM so Excel reads names with accents correctly.
  return '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n'
}

export function downloadTextFile(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Calendar date ranges ('YYYY-MM-DD' strings, inclusive) ───────────

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DATE_PRESETS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
]

export function presetRange(preset, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'last_90_days': return { from: iso(new Date(y, m, now.getDate() - 89)), to: iso(now) }
    case 'this_year': return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    default: return { from: null, to: null }
  }
}

// filter = FilterSortControl dateRange value.
export function inDateFilter(dateIso, filter) {
  if (!filter) return true
  if (!dateIso) return false
  const { from, to } = filter.type === 'preset' ? presetRange(filter.value) : filter
  if (from && dateIso < from) return false
  if (to && dateIso > to) return false
  return true
}
