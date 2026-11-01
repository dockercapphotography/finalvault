import { formatMoney, formatInvoiceDate, PAYMENT_METHODS } from './invoiceApi.js'

// ── Client Portal invoices (v1.6.0) ──────────────────────────────────────
// Helpers for the portal's Invoices pages. The data comes from
// get_client_portal_data's "invoices" key (sql/115): sent invoices only,
// each with totals, line items, schedule, payments and the payment link.

export function invoicesOf(data) {
  return data?.invoices || []
}

export function needsPayment(inv) {
  return Number(inv.balance_due) > 0
}

// Drives the badge dot on the portal's Invoices nav item.
export function pendingInvoiceCount(data) {
  return invoicesOf(data).filter(needsPayment).length
}

// Client-facing wording (agreed: "Partly paid", "Due", "Paid in full").
export function clientPaymentLabel(inv) {
  if (!needsPayment(inv)) return { label: 'Paid in full', color: '#15803d' }
  if (inv.is_overdue) return { label: 'Overdue', color: '#dc2626' }
  if (Number(inv.amount_paid) > 0) return { label: 'Partly paid', color: '#c2410c' }
  return { label: 'Due', color: '#d97706' }
}

export function invoiceTitle(inv) {
  return inv.session_name || inv.line_items?.[0]?.title || `Invoice #${inv.invoice_number}`
}

const PLATFORM_LABELS = {
  venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App', kofi: 'Ko-fi', zelle: 'Zelle',
}

const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map(m => [m.id, m.label]))

export function paymentMethodLabel(method) {
  return METHOD_LABELS[method] || ''
}

function safeUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

// Fills in the amount (and a note on Venmo) when the link is a plain
// profile link we recognize; anything else is used exactly as entered.
function withAmount(url, platform, amount, invoiceNumber) {
  const path = url.pathname.replace(/\/+$/, '')
  const oneSegment = /^\/[^/]+$/.test(path)
  if (!oneSegment || url.search || url.hash || !(amount > 0)) return url.toString()
  const fixed = Number(amount).toFixed(2)
  const host = url.hostname.replace(/^www\./, '')
  if (platform === 'venmo' && host === 'venmo.com') {
    return `${url.origin}${path}?txn=pay&amount=${fixed}&note=${encodeURIComponent(`Invoice #${invoiceNumber}`)}`
  }
  if (platform === 'paypal' && host === 'paypal.me') return `${url.origin}${path}/${fixed}`
  if (platform === 'cashapp' && host === 'cash.app') return `${url.origin}${path}/${fixed}`
  return url.toString()
}

// What to show for paying: a link button, a Zelle address to copy, or
// nothing (no platform chosen / no link saved).
//   { kind: 'link', label, href } | { kind: 'text', label, value } | null
export function payOption(inv) {
  const platform = inv.pay_platform
  const value = inv.pay_value
  if (!platform || !value || !needsPayment(inv)) return null
  const label = PLATFORM_LABELS[platform] || platform
  if (platform === 'zelle') return { kind: 'text', platform, label, value }
  const url = safeUrl(value)
  if (!url) return { kind: 'text', platform, label, value }
  return { kind: 'link', platform, label, href: withAmount(url, platform, Number(inv.next_amount), inv.invoice_number) }
}

export function nextAmountText(inv) {
  return formatMoney(Number(inv.next_amount) > 0 ? inv.next_amount : inv.balance_due)
}

// "Oct 1" this year, "Oct 1, 2025" otherwise -- keeps list rows on one line.
export function shortDate(isoDate) {
  if (!isoDate) return ''
  const sameYear = String(isoDate).slice(0, 4) === String(new Date().getFullYear())
  return formatInvoiceDate(isoDate, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
