import { supabase } from '../supabaseClient.js'

// Invoicing (v1.6.0). Schema, totals views and rules: sql/107-110.
//
// The database enforces the money rules (edit lock after a payment, paid
// installments locked, schedule = total, archive-not-delete for used
// catalog items), so these helpers just read and write rows and surface
// the database's own error messages.

// ── Formatting ───────────────────────────────────────────────────────

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatMoney(value) {
  const n = Number(value)
  return money.format(Number.isFinite(n) ? n : 0)
}

// "$350.00" or "$0.65 / mi"
export function formatUnitPrice(price, unitLabel) {
  const unit = (unitLabel || '').trim()
  return unit ? `${formatMoney(price)} / ${unit}` : formatMoney(price)
}

// Parses a typed dollar amount ("1,200", "$45.5") into a number with at
// most two decimals, or null when it isn't a valid non-negative amount.
export function parseMoneyInput(text) {
  const cleaned = String(text ?? '').replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ── Default payment platform ─────────────────────────────────────────

// One of the payment_links keys (venmo, paypal, cashapp, kofi, zelle),
// pre-selected on new invoices. null = none chosen.
export async function getDefaultInvoicePlatform() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('photographers')
    .select('default_invoice_platform')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data?.default_invoice_platform ?? null
}

export async function setDefaultInvoicePlatform(platform) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('photographers')
    .update({ default_invoice_platform: platform || null })
    .eq('id', user.id)
  if (error) throw error
}

// ── Catalog ──────────────────────────────────────────────────────────

// Every item, archived ones included, with how many invoice lines use it
// (decides Delete vs Archive). The count only sees this photographer's
// own invoices (RLS), which are the only ones that can reference it.
export async function getInvoiceCatalogItems() {
  const { data, error } = await supabase
    .from('invoice_catalog_items')
    .select('*, invoice_line_items(count)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(withUseCount)
}

function withUseCount(row) {
  const { invoice_line_items: lines, ...item } = row
  return { ...item, use_count: lines?.[0]?.count ?? 0 }
}

function catalogFields({ name, description, defaultUnitPrice, unitLabel, taxableDefault }) {
  const fields = {}
  if (name !== undefined) fields.name = name.trim()
  if (description !== undefined) fields.description = description.trim() || null
  if (defaultUnitPrice !== undefined) fields.default_unit_price = defaultUnitPrice
  if (unitLabel !== undefined) fields.unit_label = unitLabel.trim() || null
  if (taxableDefault !== undefined) fields.taxable_default = taxableDefault
  return fields
}

export async function createInvoiceCatalogItem(item) {
  const { data: { user } } = await supabase.auth.getUser()
  // New items go to the end of the list.
  const { data: last } = await supabase
    .from('invoice_catalog_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  const { data, error } = await supabase
    .from('invoice_catalog_items')
    .insert({
      photographer_id: user.id,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
      ...catalogFields(item),
    })
    .select()
    .single()
  if (error) throw error
  return { ...data, use_count: 0 }
}

export async function updateInvoiceCatalogItem(id, item) {
  const { data, error } = await supabase
    .from('invoice_catalog_items')
    .update(catalogFields(item))
    .eq('id', id)
    .select('*, invoice_line_items(count)')
    .single()
  if (error) throw error
  return withUseCount(data)
}

export async function setInvoiceCatalogItemActive(id, active) {
  const { data, error } = await supabase
    .from('invoice_catalog_items')
    .update({ active })
    .eq('id', id)
    .select('*, invoice_line_items(count)')
    .single()
  if (error) throw error
  return withUseCount(data)
}

// Fails for an item that's on an invoice (sql/109 trigger); the caller
// offers Archive instead.
export async function deleteInvoiceCatalogItem(id) {
  const { error } = await supabase.from('invoice_catalog_items').delete().eq('id', id)
  if (error) throw error
}

// ── Payment platforms ────────────────────────────────────────────────

// Same keys and labels as Account's PAYMENT_PLATFORMS (payment_links).
export const INVOICE_PLATFORMS = [
  { id: 'venmo', label: 'Venmo' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'kofi', label: 'Ko-fi' },
  { id: 'zelle', label: 'Zelle' },
]

export const PAYMENT_METHODS = [
  { id: 'venmo', label: 'Venmo' },
  { id: 'cash', label: 'Cash' },
  { id: 'check', label: 'Check' },
  { id: 'card', label: 'Card' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'kofi', label: 'Ko-fi' },
  { id: 'other', label: 'Other' },
]

export function platformLabel(id) {
  return INVOICE_PLATFORMS.find(p => p.id === id)?.label || PAYMENT_METHODS.find(p => p.id === id)?.label || ''
}

export async function getPaymentLinks() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('photographers')
    .select('payment_links, default_invoice_platform')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return { links: data?.payment_links || {}, defaultPlatform: data?.default_invoice_platform || null }
}

// ── Money math (mirrors sql/108 exactly, in integer cents) ──────────

// The database is the source of truth; this only lets the editor show
// totals as you type. Same order and rounding as invoice_totals: each line
// rounded to cents, then the discount and the tax rounded once each.

// "1", "1.5", "37.25" -> hundredths (integer); null if invalid or <= 0.
export function parseQuantity(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '')
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '.') return null
  const hundredths = Math.round(Number(cleaned) * 100)
  return hundredths > 0 ? hundredths : null
}

// Percent with up to 3 decimals, 0-100 -> thousandths of a percent; '' -> 0.
export function parseRate(text) {
  const cleaned = String(text ?? '').replace(/[%\s]/g, '')
  if (cleaned === '') return 0
  if (!/^\d*(\.\d{0,3})?$/.test(cleaned) || cleaned === '.') return null
  const n = Number(cleaned)
  return n >= 0 && n <= 100 ? Math.round(n * 1000) : null
}

export function toCents(value) {
  const n = typeof value === 'number' ? value : parseMoneyInput(value)
  return n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 100)
}

export function centsToInput(cents) {
  return (cents / 100).toFixed(2)
}

export function formatCents(cents) {
  return formatMoney((cents || 0) / 100)
}

// Half away from zero, like Postgres round() on numeric; inputs are >= 0.
function roundDiv(numerator, denominator) {
  return Math.round(numerator / denominator)
}

// lines: [{ quantity, unit_price, taxable }] as typed (strings) or numbers.
// Returns cents, or null fields when something can't be parsed yet.
export function computeTotals(lines, discountRateText, taxRateText) {
  let subtotal = 0
  let taxable = 0
  let valid = true
  const lineTotals = lines.map(l => {
    const q = typeof l.quantity === 'number' ? Math.round(l.quantity * 100) : parseQuantity(l.quantity)
    const p = toCents(l.unit_price)
    if (q === null || p === null) { valid = false; return null }
    const cents = roundDiv(q * p, 100)
    subtotal += cents
    if (l.taxable) taxable += cents
    return cents
  })
  const d = typeof discountRateText === 'number' ? Math.round(discountRateText * 1000) : parseRate(discountRateText)
  const t = typeof taxRateText === 'number' ? Math.round(taxRateText * 1000) : parseRate(taxRateText)
  if (d === null || t === null) valid = false
  const discount = roundDiv(subtotal * (d || 0), 100000)
  const taxableAfterDiscount = roundDiv(taxable * (100000 - (d || 0)), 100000)
  const tax = roundDiv(taxableAfterDiscount * (t || 0), 100000)
  return {
    valid, lineTotals, subtotal, discount, taxableAfterDiscount, tax,
    total: subtotal - discount + tax,
  }
}

// ── Invoices ─────────────────────────────────────────────────────────

const INVOICE_SELECT = `
  *,
  invoice_line_items(*),
  invoice_payment_schedule(*),
  invoice_payments(*)
`

// One invoice with its lines, schedule (with paid allocation), payments
// and totals from the database views.
export async function getInvoice(id) {
  const [{ data: inv, error }, { data: totals, error: tErr }, { data: sched, error: sErr }] = await Promise.all([
    supabase.from('invoices').select(INVOICE_SELECT).eq('id', id).single(),
    supabase.from('invoice_totals').select('*').eq('invoice_id', id).maybeSingle(),
    supabase.from('invoice_schedule_status').select('*').eq('invoice_id', id),
  ])
  if (error) throw error
  if (tErr) throw tErr
  if (sErr) throw sErr
  const allocation = Object.fromEntries((sched || []).map(s => [s.schedule_id, s]))
  return {
    ...inv,
    line_items: [...(inv.invoice_line_items || [])].sort((a, b) => a.sort_order - b.sort_order),
    schedule: [...(inv.invoice_payment_schedule || [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map(r => ({ ...r, allocated: Number(allocation[r.id]?.allocated || 0), row_status: allocation[r.id]?.row_status || 'unpaid' })),
    payments: [...(inv.invoice_payments || [])].sort((a, b) => (a.paid_date < b.paid_date ? -1 : a.paid_date > b.paid_date ? 1 : 0)),
    totals,
  }
}

// A session's invoices for Session Detail: number, status, money and the
// first line's name (so a row reads "#1058 · Full Wedding Package").
export async function getSessionInvoices(sessionId) {
  const [{ data: rows, error }, { data: totals, error: tErr }] = await Promise.all([
    supabase.from('invoices')
      .select('id, invoice_number, status, created_at, invoice_line_items(title, sort_order)')
      .eq('session_id', sessionId)
      .order('invoice_number', { ascending: true }),
    supabase.from('invoice_totals')
      .select('invoice_id, total, amount_paid, balance_due, payment_status, is_overdue, next_due_date')
      .eq('session_id', sessionId),
  ])
  if (error) throw error
  if (tErr) throw tErr
  const byId = Object.fromEntries((totals || []).map(t => [t.invoice_id, t]))
  return (rows || []).map(r => {
    const lines = [...(r.invoice_line_items || [])].sort((a, b) => a.sort_order - b.sort_order)
    const rest = { ...r }
    delete rest.invoice_line_items
    return { ...rest, first_line: lines[0]?.title || '', line_count: lines.length, ...(byId[r.id] || {}) }
  })
}

// A client's invoices for the Send Contract invoice picker (drafts included,
// voids left out), newest first, with what the contract variables need.
// first_payment = the first installment when there's a schedule of 2+.
export async function getClientInvoicesForContracts(clientId) {
  const [{ data: rows, error }, { data: totals, error: tErr }] = await Promise.all([
    supabase.from('invoices')
      .select('id, invoice_number, status, session_id, due_date, invoice_payment_schedule(sequence, amount, due_date), invoice_line_items(title, sort_order)')
      .eq('client_id', clientId)
      .neq('status', 'void')
      .order('invoice_number', { ascending: false }),
    supabase.from('invoice_totals')
      .select('invoice_id, total, balance_due, next_due_date')
      .eq('client_id', clientId),
  ])
  if (error) throw error
  if (tErr) throw tErr
  const byId = Object.fromEntries((totals || []).map(t => [t.invoice_id, t]))
  return (rows || []).map(r => {
    const sched = [...(r.invoice_payment_schedule || [])].sort((a, b) => a.sequence - b.sequence)
    const firstLine = [...(r.invoice_line_items || [])].sort((a, b) => a.sort_order - b.sort_order)[0]
    const t = byId[r.id] || {}
    return {
      id: r.id, invoice_number: r.invoice_number, status: r.status, session_id: r.session_id,
      label: firstLine?.title || '',
      total: Number(t.total || 0),
      balance_due: Number(t.balance_due || 0),
      due_date: t.next_due_date || r.due_date || null,
      first_payment: sched.length > 1 ? Number(sched[0].amount) : null,
      // Last installment, or the whole invoice when there's no schedule.
      final_payment: sched.length > 1 ? Number(sched[sched.length - 1].amount) : Number(t.total || 0),
      final_due_date: sched.length > 1 ? (sched[sched.length - 1].due_date || null) : (r.due_date || null),
    }
  })
}

// Invoice-derived payment status per session (sql/108 session_invoice_status),
// keyed by session id. Void invoices are already left out by the view.
export async function getSessionPaymentStatuses() {
  const { data, error } = await supabase
    .from('session_invoice_status')
    .select('session_id, payment_status, is_overdue, invoice_count')
  if (error) throw error
  return Object.fromEntries((data || []).map(r => [r.session_id, r]))
}

// payload: see sql/111 save_invoice. Returns the invoice id.
export async function saveInvoice(payload) {
  const { data, error } = await supabase.rpc('save_invoice', { p_invoice: payload })
  if (error) throw error
  return data
}

export async function duplicateInvoice(id) {
  const { data, error } = await supabase.rpc('duplicate_invoice', { p_invoice_id: id })
  if (error) throw error
  return data
}

export async function voidInvoice(id) {
  const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', id)
  if (error) throw error
}

// Drafts with no payments only (sql/109).
export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
}

export async function logPayment(invoiceId, { amount, paidDate, method, note }) {
  const { error } = await supabase.from('invoice_payments').insert({
    invoice_id: invoiceId,
    amount,
    paid_date: paidDate,
    method: method || null,
    note: (note || '').trim() || null,
  })
  if (error) throw error
}

export async function updatePayment(paymentId, { amount, paidDate, method, note }) {
  const { error } = await supabase.from('invoice_payments').update({
    amount,
    paid_date: paidDate,
    method: method || null,
    note: (note || '').trim() || null,
  }).eq('id', paymentId)
  if (error) throw error
}

export async function deletePayment(paymentId) {
  const { error } = await supabase.from('invoice_payments').delete().eq('id', paymentId)
  if (error) throw error
}

// ── Invoice templates (sql/112) ──────────────────────────────────────

export const DUE_RULES = [
  { id: 'on_create', label: 'When the invoice is created', needsDays: false },
  { id: 'after_create', label: 'Days after the invoice is created', needsDays: true },
  { id: 'before_session', label: 'Days before the session', needsDays: true },
  { id: 'on_session', label: 'On the session date', needsDays: false },
]

// "50% now · 50% 14 days before the session"
export function describeSchedulePattern(rows) {
  return (rows || []).map(r => {
    const pct = `${Number(r.percent)}%`
    switch (r.due_rule) {
      case 'after_create': return `${pct} ${r.due_days} days after creating`
      case 'before_session': return `${pct} ${r.due_days} days before the session`
      case 'on_session': return `${pct} on the session date`
      default: return `${pct} now`
    }
  }).join(' · ')
}

// Templates with their lines (catalog values filled in, sql/112's view)
// and schedule pattern.
export async function getInvoiceTemplates() {
  const [{ data: templates, error }, { data: items, error: iErr }, { data: schedule, error: sErr }] = await Promise.all([
    supabase.from('invoice_templates').select('*').order('name', { ascending: true }),
    supabase.from('invoice_template_items_resolved').select('*').order('sort_order', { ascending: true }),
    supabase.from('invoice_template_schedule').select('*').order('sequence', { ascending: true }),
  ])
  if (error) throw error
  if (iErr) throw iErr
  if (sErr) throw sErr
  return (templates || []).map(t => ({
    ...t,
    items: (items || []).filter(i => i.template_id === t.id),
    schedule: (schedule || []).filter(s => s.template_id === t.id),
  }))
}

export async function saveInvoiceTemplate(payload) {
  const { data, error } = await supabase.rpc('save_invoice_template', { p_template: payload })
  if (error) throw error
  return data
}

export async function deleteInvoiceTemplate(id) {
  const { error } = await supabase.from('invoice_templates').delete().eq('id', id)
  if (error) throw error
}

// Template lines -> editor lines (the shape LineItemsEditor uses).
// `newKey` makes each line's React key. `overrides` records which fields of
// a catalog line the photographer changed (sql/112's view), so saving
// keeps every other field following the catalog.
export function templateToLines(template, newKey) {
  return (template.items || []).map(i => ({
    key: newKey(), catalog_item_id: i.catalog_item_id || null,
    title: i.title || '', description: i.description || '',
    quantity: String(Number(i.quantity)),
    unit_price: centsToInput(Math.round(Number(i.unit_price || 0) * 100)),
    unit_label: i.unit_label || '', taxable: i.taxable !== false,
    overrides: {
      title: Boolean(i.title_overridden), description: Boolean(i.description_overridden),
      unit_price: Boolean(i.price_overridden), unit_label: Boolean(i.unit_overridden),
      taxable: Boolean(i.taxable_overridden),
    },
  }))
}

// Catalog line field -> the catalog item's value it's compared against.
export function catalogFieldValue(item, field) {
  switch (field) {
    case 'title': return item.name || ''
    case 'description': return item.description || ''
    case 'unit_price': return Math.round(Number(item.default_unit_price || 0) * 100)
    case 'unit_label': return item.unit_label || ''
    case 'taxable': return item.taxable_default !== false
    default: return undefined
  }
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Due date for one pattern row. Session-based rules need a session date;
// without one the installment gets no date.
export function patternDueDate(row, { createdDate, sessionDate }) {
  switch (row.due_rule) {
    case 'after_create': return addDays(createdDate, Number(row.due_days || 0))
    case 'before_session': return sessionDate ? addDays(sessionDate, -Number(row.due_days || 0)) : ''
    case 'on_session': return sessionDate || ''
    default: return createdDate
  }
}

// Pattern percentages -> installment amounts (cents) that add up exactly to
// the total; the last one takes the rounding.
export function patternAmounts(pattern, totalCents) {
  let assigned = 0
  return pattern.map((r, i) => {
    if (i === pattern.length - 1) return totalCents - assigned
    const cents = Math.round(totalCents * Number(r.percent) / 100)
    assigned += cents
    return cents
  })
}

// ── Status display ───────────────────────────────────────────────────

export const INVOICE_STATUS_STYLES = {
  draft: { label: 'Draft', color: '#6b7280' },
  sent: { label: 'Sent', color: '#6366f1' },
  void: { label: 'Void', color: '#6b7280' },
}

export const PAYMENT_STATUS_STYLES = {
  unpaid: { label: 'Unpaid', color: '#ef4444' },
  partial: { label: 'Partial', color: '#f97316' },
  paid: { label: 'Paid', color: '#10b981' },
}

export function formatInvoiceDate(isoDate, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!isoDate) return ''
  const d = new Date(String(isoDate).length === 10 ? `${isoDate}T00:00:00` : isoDate)
  return d.toLocaleDateString('en-US', opts)
}

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
