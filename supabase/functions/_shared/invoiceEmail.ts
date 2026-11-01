// supabase/functions/_shared/invoiceEmail.ts
//
// v1.6.0 step 9: the invoice / payment-reminder email.
//
// The subject and message arrive with template variables already filled in
// by the Send dialog (what the photographer previews is what's sent, same
// as review requests); everything is escaped here. The email always shows
// the invoice summary, and adds:
//   * a Pay button straight to the photographer's payment page (Venmo,
//     PayPal, Cash App, Ko-fi -- amount filled in where the platform
//     allows), or the Zelle address as text           -> works for every client
//   * a "View invoice online" button, only when the client already has a
//     portal link (we never create one behind the photographer's back)
//   * a note that the PDF is attached, when it is

import { escapeHtml, safeUrl } from './escapeHtml.ts'
import type { InvoiceDoc } from './invoicePdf.ts'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const fmtMoney = (n: number) => money.format(n)

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const s = String(iso)
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const PLATFORM_LABELS: Record<string, string> = {
  venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App', kofi: 'Ko-fi', zelle: 'Zelle',
}

export function amountDueNow(doc: InvoiceDoc) {
  return doc.next_amount > 0 ? doc.next_amount : doc.balance_due
}

// Same rules as the portal's Pay button (src/utils/portalInvoices.js):
// only https links; the amount is added to one-segment venmo.com /
// paypal.me / cash.app profile links; anything else is used as entered.
export function payOption(doc: InvoiceDoc):
  | { kind: 'link'; label: string; href: string }
  | { kind: 'text'; label: string; value: string }
  | null {
  if (doc.status !== 'sent' || doc.balance_due <= 0 || !doc.pay_platform || !doc.pay_value) return null
  const label = PLATFORM_LABELS[doc.pay_platform] || doc.pay_platform
  if (doc.pay_platform === 'zelle') return { kind: 'text', label, value: doc.pay_value }
  let url: URL
  try {
    url = new URL(doc.pay_value)
  } catch {
    return { kind: 'text', label, value: doc.pay_value }
  }
  if (url.protocol !== 'https:') return { kind: 'text', label, value: doc.pay_value }

  const path = url.pathname.replace(/\/+$/, '')
  const host = url.hostname.replace(/^www\./, '')
  const amount = amountDueNow(doc).toFixed(2)
  let href = url.toString()
  if (/^\/[^/]+$/.test(path) && !url.search && !url.hash) {
    if (doc.pay_platform === 'venmo' && host === 'venmo.com') {
      href = `${url.origin}${path}?txn=pay&amount=${amount}&note=${encodeURIComponent(`Invoice #${doc.invoice_number}`)}`
    } else if ((doc.pay_platform === 'paypal' && host === 'paypal.me') || (doc.pay_platform === 'cashapp' && host === 'cash.app')) {
      href = `${url.origin}${path}/${amount}`
    }
  }
  return { kind: 'link', label, href }
}

// **bold**, *italic*, "- " and "1. " lists, "## " headings, blank lines --
// the same subset the template editor's toolbar writes (mirrors
// send-gallery-email's renderMarkdownEmail).
function inline(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

export function renderMessage(text: string): string {
  if (!text) return ''
  const out: string[] = []
  let list: string[] = []
  let listType: 'ul' | 'ol' | null = null
  const li = (s: string) => `<li style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">${inline(s)}</li>`
  const flush = () => {
    if (!listType) return
    out.push(`<${listType} style="margin:0 0 12px;padding-left:20px;">${list.join('')}</${listType}>`)
    list = []
    listType = null
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { flush(); out.push(`<h2 style="margin:16px 0 8px;color:#111111;font-size:17px;font-weight:600;">${inline(line.slice(3))}</h2>`); continue }
    if (line.startsWith('- ')) { if (listType !== 'ul') { flush(); listType = 'ul' } list.push(li(line.slice(2))); continue }
    const ol = line.match(/^\d+\.\s(.*)/)
    if (ol) { if (listType !== 'ol') { flush(); listType = 'ol' } list.push(li(ol[1])); continue }
    flush()
    out.push(line.trim() === ''
      ? '<div style="height:12px;"></div>'
      : `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">${inline(line)}</p>`)
  }
  flush()
  return out.join('')
}

function row(label: string, value: string, opts: { strong?: boolean; color?: string } = {}) {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;text-align:right;color:${opts.color || '#111111'};font-size:${opts.strong ? 16 : 14}px;font-weight:${opts.strong ? 700 : 500};">${escapeHtml(value)}</td>
  </tr>`
}

function button(href: string, label: string, primary: boolean) {
  return primary
    ? `<a href="${safeUrl(href)}" style="display:block;background:#6366f1;color:#ffffff;border-radius:10px;padding:14px 20px;font-size:15px;font-weight:600;text-decoration:none;text-align:center;">${escapeHtml(label)}</a>`
    : `<a href="${safeUrl(href)}" style="display:block;background:#ffffff;color:#111111;border:1px solid #d1d5db;border-radius:10px;padding:13px 20px;font-size:15px;font-weight:600;text-decoration:none;text-align:center;">${escapeHtml(label)}</a>`
}

export function buildInvoiceEmailHtml({ doc, message, logoUrl, portalUrl, pdfAttached, kind }: {
  doc: InvoiceDoc
  message: string
  logoUrl: string | null
  portalUrl: string | null
  pdfAttached: boolean
  kind: 'invoice' | 'reminder'
}): string {
  const business = doc.business.name
  const pay = payOption(doc)
  const due = doc.balance_due > 0
  const dueDate = due ? (doc.next_due_date || doc.due_date) : null
  const partOfSchedule = due && doc.next_amount > 0 && doc.next_amount < doc.balance_due

  const summaryRows = [
    doc.session_name ? row('For', doc.session_name) : '',
    row('Invoice total', fmtMoney(doc.total)),
    doc.amount_paid > 0 ? row('Paid so far', fmtMoney(doc.amount_paid)) : '',
    due
      ? row(partOfSchedule ? 'Due now' : 'Amount due', fmtMoney(amountDueNow(doc)), { strong: true })
      : row('Status', 'Paid in full', { strong: true, color: '#15803d' }),
    partOfSchedule ? row('Remaining after this payment', fmtMoney(doc.balance_due - amountDueNow(doc))) : '',
    dueDate ? row(doc.is_overdue ? 'Was due' : 'Due date', fmtDate(dueDate), doc.is_overdue ? { color: '#dc2626' } : {}) : '',
  ].join('')

  const actions: string[] = []
  if (pay?.kind === 'link') {
    actions.push(`<tr><td style="padding:0 0 10px;">${button(pay.href, `Pay ${fmtMoney(amountDueNow(doc))} with ${pay.label}`, true)}</td></tr>`)
  }
  if (pay?.kind === 'text') {
    actions.push(`<tr><td style="padding:0 0 10px;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
        <p style="margin:0;color:#6b7280;font-size:13px;">Send ${escapeHtml(fmtMoney(amountDueNow(doc)))} with ${escapeHtml(pay.label)} to</p>
        <p style="margin:4px 0 0;color:#111111;font-size:15px;font-weight:600;word-break:break-all;">${escapeHtml(pay.value)}</p>
      </div></td></tr>`)
  }
  if (portalUrl) {
    actions.push(`<tr><td style="padding:0 0 10px;">${button(portalUrl, 'View invoice online', !pay || pay.kind !== 'link')}</td></tr>`)
  }

  const header = logoUrl
    ? `<img src="${safeUrl(logoUrl)}" alt="${escapeHtml(business)}" style="max-height:56px;max-width:240px;height:auto;width:auto;border:0;display:inline-block;">`
    : `<p style="margin:0;color:#111111;font-size:18px;font-weight:700;">${escapeHtml(business)}</p>`

  const title = kind === 'reminder' ? `Payment reminder · Invoice #${doc.invoice_number}` : `Invoice #${doc.invoice_number}`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="padding:28px 40px 20px;text-align:center;border-bottom:1px solid #f0f0f0;">${header}</td></tr>
        <tr><td style="padding:32px 40px 8px;">
          ${renderMessage(message)}
        </td></tr>
        <tr><td style="padding:8px 40px 8px;">
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;">
            <p style="margin:0 0 6px;color:#6366f1;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(title)}</p>
            <table width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>
          </div>
        </td></tr>
        <tr><td style="padding:16px 40px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">${actions.join('')}</table>
        </td></tr>
        ${pdfAttached ? `<tr><td style="padding:0 40px 24px;"><p style="margin:0;color:#6b7280;font-size:13px;">Your invoice is attached as a PDF for your records.</p></td></tr>` : '<tr><td style="padding:0 0 16px;"></td></tr>'}
        <tr><td style="padding:18px 40px;border-top:1px solid #f0f0f0;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Questions? Just reply to this email to reach ${escapeHtml(business)}.</p>
          <p style="margin:6px 0 0;color:#c4c4c8;font-size:11px;">Sent via FinalVault</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
