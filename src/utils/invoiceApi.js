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
