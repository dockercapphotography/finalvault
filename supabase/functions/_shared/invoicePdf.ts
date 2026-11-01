// supabase/functions/_shared/invoicePdf.ts
//
// v1.6.0: builds an invoice PDF on demand. Invoices change as payments come
// in, so nothing is stored -- every download (and, in step 9, every invoice
// email) renders the current state.
//
// Two ways in, both ending in the same InvoiceDoc shape:
//   loadInvoiceForPhotographer -- the signed-in owner; any status (drafts and
//                                 voids are labelled on the page)
//   loadInvoiceForPortal       -- a client's portal token (+ portal password
//                                 when one is set). Goes through
//                                 get_client_portal_data, so the portal's own
//                                 rules apply: sent invoices of that client
//                                 only, password gate and lockout included.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'https://esm.sh/pdf-lib@1.17.1'

// deno-lint-ignore no-explicit-any
type Supabase = any

export interface InvoiceLine {
  title: string
  description: string | null
  quantity: number
  unit_price: number
  unit_label: string | null
  line_total: number
}

export interface InvoiceDoc {
  invoice_number: number
  status: 'draft' | 'sent' | 'void'
  sent_at: string | null
  created_at: string
  due_date: string | null
  next_due_date: string | null
  is_overdue: boolean
  session_name: string | null
  session_date: string | null
  notes: string | null
  tax_rate: number | null
  discount_rate: number | null
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  amount_paid: number
  balance_due: number
  next_amount: number
  pay_platform: string | null
  pay_value: string | null
  line_items: InvoiceLine[]
  schedule: { sequence: number; amount: number; due_date: string | null; allocated: number; row_status: string }[]
  payments: { amount: number; paid_date: string; method: string | null }[]
  client: { name: string; email: string | null }
  business: { name: string; email: string | null; logoKey: string | null }
}

const num = (v: unknown) => Number(v ?? 0)

// ── Loading ─────────────────────────────────────────────────────────────

async function loadBusiness(supabase: Supabase, photographerId: string) {
  const { data } = await supabase
    .from('photographers')
    .select('display_name, business_name, business_email, logo_r2_key, invoice_logo_r2_key, invoice_logo_mode, payment_links, default_invoice_platform')
    .eq('id', photographerId)
    .single()
  return data || {}
}

// Which logo invoices use (sql/117): 'none' = name only, 'main' = the
// account logo, otherwise the light-background invoice logo when one is
// uploaded, falling back to the account logo.
// deno-lint-ignore no-explicit-any
export function invoiceLogoKey(ph: any): string | null {
  if (ph?.invoice_logo_mode === 'none') return null
  if (ph?.invoice_logo_mode === 'main') return ph?.logo_r2_key || null
  return ph?.invoice_logo_r2_key || ph?.logo_r2_key || null
}

export async function loadInvoiceForPhotographer(supabase: Supabase, invoiceId: string, userId: string): Promise<InvoiceDoc | null> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('*, invoice_line_items(*), invoice_payments(amount, paid_date, method, created_at)')
    .eq('id', invoiceId)
    .eq('photographer_id', userId)
    .maybeSingle()
  if (!inv) return null

  // Client and session are read separately: both foreign keys are composite
  // (id, photographer_id), so an embedded select isn't worth the guesswork.
  const [{ data: t }, { data: sched }, ph, { data: client }, { data: session }] = await Promise.all([
    supabase.from('invoice_totals').select('*').eq('invoice_id', invoiceId).single(),
    supabase.from('invoice_schedule_status').select('*').eq('invoice_id', invoiceId).order('sequence'),
    loadBusiness(supabase, userId),
    inv.client_id
      ? supabase.from('clients').select('first_name, last_name, email').eq('id', inv.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    inv.session_id
      ? supabase.from('sessions').select('name, session_date').eq('id', inv.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const schedule = (sched || []).map((s: Record<string, unknown>) => ({
    sequence: num(s.sequence), amount: num(s.amount), due_date: (s.due_date as string) || null,
    allocated: num(s.allocated), row_status: String(s.row_status),
  }))
  const nextRow = schedule.find((s: { row_status: string }) => s.row_status !== 'paid')
  const platform = inv.payment_platform || ph.default_invoice_platform || null
  const clientName = client
    ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
    : (inv.client_name || '')

  return {
    invoice_number: inv.invoice_number,
    status: inv.status,
    sent_at: inv.sent_at,
    created_at: inv.created_at,
    due_date: inv.due_date,
    next_due_date: t?.next_due_date ?? null,
    is_overdue: Boolean(t?.is_overdue),
    session_name: session?.name ?? null,
    session_date: session?.session_date ?? null,
    notes: inv.notes,
    tax_rate: inv.tax_rate == null ? null : num(inv.tax_rate),
    discount_rate: inv.discount_rate == null ? null : num(inv.discount_rate),
    subtotal: num(t?.subtotal),
    discount_amount: num(t?.discount_amount),
    tax_amount: num(t?.tax_amount),
    total: num(t?.total),
    amount_paid: num(t?.amount_paid),
    balance_due: num(t?.balance_due),
    next_amount: nextRow ? nextRow.amount - nextRow.allocated : num(t?.balance_due),
    pay_platform: platform,
    pay_value: platform ? (String(ph.payment_links?.[platform] ?? '').trim() || null) : null,
    line_items: [...(inv.invoice_line_items || [])]
      .sort((a: Record<string, number>, b: Record<string, number>) => a.sort_order - b.sort_order)
      .map((l: Record<string, unknown>) => ({
        title: String(l.title), description: (l.description as string) || null,
        quantity: num(l.quantity), unit_price: num(l.unit_price), unit_label: (l.unit_label as string) || null,
        line_total: Math.round(num(l.quantity) * num(l.unit_price) * 100) / 100,
      })),
    schedule,
    payments: [...(inv.invoice_payments || [])]
      .sort((a: Record<string, string>, b: Record<string, string>) => (a.paid_date + a.created_at).localeCompare(b.paid_date + b.created_at))
      .map((p: Record<string, unknown>) => ({ amount: num(p.amount), paid_date: String(p.paid_date), method: (p.method as string) || null })),
    client: { name: clientName || 'Client', email: client?.email ?? inv.client_email ?? null },
    business: {
      name: ph.business_name || ph.display_name || 'Photographer',
      email: ph.business_email || null,
      logoKey: invoiceLogoKey(ph),
    },
  }
}

export type PortalResult =
  | { ok: true; doc: InvoiceDoc }
  | { ok: false; status: number; error: string }

export async function loadInvoiceForPortal(supabase: Supabase, token: string, password: string | null, invoiceId: string): Promise<PortalResult> {
  const { data, error } = await supabase.rpc('get_client_portal_data', { p_token: token, p_password: password })
  if (error) return { ok: false, status: 500, error: 'Could not load the invoice' }
  if (!data) return { ok: false, status: 404, error: 'Invoice not found' }
  if (data.password_required) return { ok: false, status: 401, error: 'Password required' }

  // deno-lint-ignore no-explicit-any
  const inv = (data.invoices || []).find((i: any) => i.id === invoiceId)
  if (!inv) return { ok: false, status: 404, error: 'Invoice not found' }

  const ph = await loadBusiness(supabase, data.client.photographer_id)
  return {
    ok: true,
    doc: {
      ...inv,
      status: 'sent',
      tax_rate: inv.tax_rate == null ? null : num(inv.tax_rate),
      discount_rate: inv.discount_rate == null ? null : num(inv.discount_rate),
      subtotal: num(inv.subtotal), discount_amount: num(inv.discount_amount), tax_amount: num(inv.tax_amount),
      total: num(inv.total), amount_paid: num(inv.amount_paid), balance_due: num(inv.balance_due),
      next_amount: num(inv.next_amount),
      // deno-lint-ignore no-explicit-any
      line_items: (inv.line_items || []).map((l: any) => ({ ...l, quantity: num(l.quantity), unit_price: num(l.unit_price), line_total: num(l.line_total) })),
      // deno-lint-ignore no-explicit-any
      schedule: (inv.schedule || []).map((s: any) => ({ ...s, amount: num(s.amount), allocated: num(s.allocated) })),
      // deno-lint-ignore no-explicit-any
      payments: (inv.payments || []).map((p: any) => ({ ...p, amount: num(p.amount) })),
      client: { name: `${data.client.first_name || ''} ${data.client.last_name || ''}`.trim() || 'Client', email: data.client.email || null },
      business: {
        name: ph.business_name || ph.display_name || 'Photographer',
        email: ph.business_email || null,
        logoKey: invoiceLogoKey(ph),
      },
    },
  }
}

// Logo bytes from the r2-worker's public /logo route. Only PNG and JPEG can
// be embedded; anything else (SVG, WebP) falls back to the business name.
export async function fetchLogo(workerUrl: string, logoKey: string | null): Promise<Uint8Array | null> {
  if (!logoKey) return null
  try {
    const resp = await fetch(`${workerUrl}/logo/${encodeURIComponent(logoKey)}`)
    if (!resp.ok) return null
    const bytes = new Uint8Array(await resp.arrayBuffer())
    if (bytes.length > 4_000_000) return null
    return bytes
  } catch {
    return null
  }
}

// ── Formatting ──────────────────────────────────────────────────────────

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const fmtMoney = (n: number) => money.format(n)

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const s = String(iso)
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: s.length === 10 ? 'UTC' : 'America/New_York' })
}

const PLATFORM_LABELS: Record<string, string> = {
  venmo: 'Venmo', paypal: 'PayPal', cashapp: 'Cash App', kofi: 'Ko-fi', zelle: 'Zelle',
  cash: 'Cash', check: 'Check', card: 'Card', other: 'Other',
}

function trimNumber(n: number, digits = 3) {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function unitPrice(price: number, unitLabel: string | null) {
  const cents = Math.round(price * 100) === price * 100
  const p = cents ? fmtMoney(price) : `$${trimNumber(price, 4)}`
  return unitLabel ? `${p} / ${unitLabel}` : p
}

// ── Rendering ───────────────────────────────────────────────────────────

const PAGE_W = 612
const PAGE_H = 792
const M = 50
const CONTENT_W = PAGE_W - M * 2

const INK = rgb(0.07, 0.07, 0.09)
const MUTED = rgb(0.45, 0.47, 0.52)
const LINE = rgb(0.88, 0.89, 0.91)
const SOFT = rgb(0.96, 0.96, 0.97)
const GREEN = rgb(0.08, 0.5, 0.24)
const AMBER = rgb(0.85, 0.47, 0.02)
const RED = rgb(0.86, 0.15, 0.15)

export async function renderInvoicePdf(doc: InvoiceDoc, logoBytes: Uint8Array | null = null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Invoice #${doc.invoice_number}`)
  pdf.setAuthor(doc.business.name)
  pdf.setCreator('FinalVault')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Helvetica only covers WinAnsi; swap common look-alikes and drop the rest
  // (emoji etc.) rather than failing the whole PDF.
  const encodable = new Map<string, boolean>()
  function clean(text: unknown): string {
    const s = String(text ?? '')
      .replace(/[−‒–]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/ /g, ' ')
      .replace(/\t/g, '  ')
    let out = ''
    for (const ch of s) {
      if (ch === '\n') { out += ch; continue }
      let ok = encodable.get(ch)
      if (ok === undefined) {
        try { font.encodeText(ch); ok = true } catch { ok = false }
        encodable.set(ch, ok)
      }
      if (ok) out += ch
    }
    return out
  }

  function wrap(text: string, f: PDFFont, size: number, maxW: number): string[] {
    const lines: string[] = []
    for (const para of clean(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean)
      if (!words.length) { lines.push(''); continue }
      let cur = ''
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w
        if (f.widthOfTextAtSize(test, size) <= maxW) { cur = test; continue }
        if (cur) lines.push(cur)
        // A single word wider than the column is cut into pieces.
        let piece = w
        while (f.widthOfTextAtSize(piece, size) > maxW) {
          let n = piece.length - 1
          while (n > 1 && f.widthOfTextAtSize(piece.slice(0, n), size) > maxW) n--
          lines.push(piece.slice(0, n))
          piece = piece.slice(n)
        }
        cur = piece
      }
      lines.push(cur)
    }
    return lines
  }

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    y = PAGE_H - M
  }
  function ensure(h: number) {
    if (y - h < M + 24) {
      newPage()
      text(`Invoice #${doc.invoice_number} (continued)`, M, y - 9, 9, font, MUTED)
      y -= 26
    }
  }
  function text(s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) {
    page.drawText(clean(s), { x, y: yy, size, font: f, color })
  }
  function textRight(s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color = INK) {
    const c = clean(s)
    page.drawText(c, { x: xRight - f.widthOfTextAtSize(c, size), y: yy, size, font: f, color })
  }
  function rule(yy: number, color = LINE) {
    page.drawLine({ start: { x: M, y: yy }, end: { x: PAGE_W - M, y: yy }, thickness: 0.75, color })
  }

  newPage()

  // ── Header: logo or business name, INVOICE + number + status ──────────
  let logo: PDFImage | null = null
  if (logoBytes) {
    try {
      const isPng = logoBytes[0] === 0x89 && logoBytes[1] === 0x50
      const isJpg = logoBytes[0] === 0xff && logoBytes[1] === 0xd8
      logo = isPng ? await pdf.embedPng(logoBytes) : isJpg ? await pdf.embedJpg(logoBytes) : null
    } catch {
      logo = null
    }
  }

  const headerTop = y
  let leftBottom = headerTop
  if (logo) {
    const scale = Math.min(150 / logo.width, 56 / logo.height, 1)
    const w = logo.width * scale
    const h = logo.height * scale
    page.drawImage(logo, { x: M, y: headerTop - h, width: w, height: h })
    leftBottom = headerTop - h - 10
    text(doc.business.name, M, leftBottom - 10, 11, bold)
    leftBottom -= 14
  } else {
    for (const line of wrap(doc.business.name, bold, 18, 300)) {
      text(line, M, leftBottom - 18, 18, bold)
      leftBottom -= 22
    }
  }
  if (doc.business.email) {
    text(doc.business.email, M, leftBottom - 12, 9.5, font, MUTED)
    leftBottom -= 14
  }

  const right = PAGE_W - M
  textRight('INVOICE', right, headerTop - 20, 22, bold)
  textRight(`#${doc.invoice_number}`, right, headerTop - 38, 12, font, MUTED)

  let stamp: { label: string; color: ReturnType<typeof rgb> } | null = null
  if (doc.status === 'void') stamp = { label: 'VOID', color: MUTED }
  else if (doc.status === 'draft') stamp = { label: 'DRAFT', color: MUTED }
  else if (doc.balance_due <= 0) stamp = { label: 'PAID IN FULL', color: GREEN }
  else if (doc.is_overdue) stamp = { label: 'OVERDUE', color: RED }
  else if (doc.amount_paid > 0) stamp = { label: 'PARTLY PAID', color: AMBER }
  if (stamp) {
    const size = 9
    const w = bold.widthOfTextAtSize(stamp.label, size) + 14
    page.drawRectangle({ x: right - w, y: headerTop - 60, width: w, height: 16, borderColor: stamp.color, borderWidth: 1 })
    textRight(stamp.label, right - 7, headerTop - 55, size, bold, stamp.color)
  }

  y = Math.min(leftBottom, headerTop - 70) - 18
  rule(y)
  y -= 22

  // ── Bill to / details ──────────────────────────────────────────────────
  const detailRows: [string, string][] = []
  const issued = doc.sent_at || doc.created_at
  if (issued) detailRows.push([doc.status === 'draft' ? 'Created' : 'Invoice date', fmtDate(issued)])
  const due = doc.balance_due > 0 && doc.next_due_date ? doc.next_due_date : doc.due_date
  if (due && doc.status !== 'void') detailRows.push([doc.balance_due > 0 ? 'Due' : 'Due date', fmtDate(due)])
  if (doc.session_name) detailRows.push(['Session', doc.session_date ? `${doc.session_name} (${fmtDate(doc.session_date)})` : doc.session_name])

  const blockTop = y
  text('BILL TO', M, y, 8, bold, MUTED)
  let ly = y - 15
  for (const line of wrap(doc.client.name, bold, 11, 230)) { text(line, M, ly, 11, bold); ly -= 14 }
  if (doc.client.email) { text(doc.client.email, M, ly, 9.5, font, MUTED); ly -= 13 }

  const labelX = 320
  const valueX = 400
  let ry = blockTop
  for (const [label, value] of detailRows) {
    text(label, labelX, ry, 9, font, MUTED)
    const lines = wrap(value, font, 9.5, right - valueX)
    for (const line of lines) { text(line, valueX, ry, 9.5); ry -= 13 }
    ry -= 2
  }
  y = Math.min(ly, ry) - 16

  // ── Line items ─────────────────────────────────────────────────────────
  const colQty = 360
  const colPrice = 470
  const descW = colQty - M - 50

  page.drawRectangle({ x: M, y: y - 6, width: CONTENT_W, height: 20, color: SOFT })
  text('DESCRIPTION', M + 8, y, 8, bold, MUTED)
  textRight('QTY', colQty, y, 8, bold, MUTED)
  textRight('PRICE', colPrice, y, 8, bold, MUTED)
  textRight('AMOUNT', right - 8, y, 8, bold, MUTED)
  y -= 24

  for (const li of doc.line_items) {
    const titleLines = wrap(li.title, bold, 10, descW)
    const descLines = li.description ? wrap(li.description, font, 9, descW) : []
    const h = titleLines.length * 13 + descLines.length * 12 + 10
    ensure(h)
    const top = y
    textRight(trimNumber(li.quantity, 2), colQty, top, 10)
    textRight(unitPrice(li.unit_price, li.unit_label), colPrice, top, 10)
    textRight(fmtMoney(li.line_total), right - 8, top, 10)
    for (const line of titleLines) { text(line, M + 8, y, 10, bold); y -= 13 }
    for (const line of descLines) { text(line, M + 8, y, 9, font, MUTED); y -= 12 }
    y -= 4
    rule(y + 6)
    y -= 6
  }

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals: [string, string, boolean][] = []
  const hasDiscount = doc.discount_amount > 0
  const hasTax = doc.tax_amount > 0
  if (hasDiscount || hasTax) totals.push(['Subtotal', fmtMoney(doc.subtotal), false])
  if (hasDiscount) totals.push([`Discount (${trimNumber(num(doc.discount_rate))}%)`, `-${fmtMoney(doc.discount_amount)}`, false])
  if (hasTax) totals.push([`Tax (${trimNumber(num(doc.tax_rate))}%)`, fmtMoney(doc.tax_amount), false])
  totals.push(['Total', fmtMoney(doc.total), true])
  if (doc.amount_paid > 0) {
    totals.push(['Paid', `-${fmtMoney(doc.amount_paid)}`, false])
    totals.push(['Balance due', fmtMoney(doc.balance_due), true])
  }

  ensure(totals.length * 17 + 10)
  y -= 4
  for (const [label, value, strong] of totals) {
    const f = strong ? bold : font
    const size = strong ? 11 : 10
    text(label, 360, y, size, f, strong ? INK : MUTED)
    textRight(value, right - 8, y, size, f)
    y -= 17
  }
  y -= 10

  function sectionTitle(title: string) {
    ensure(40)
    text(title.toUpperCase(), M, y, 8, bold, MUTED)
    y -= 6
    rule(y)
    y -= 15
  }

  // ── Payment schedule ───────────────────────────────────────────────────
  if (doc.schedule.length > 1 && doc.status !== 'void') {
    sectionTitle('Payment schedule')
    const today = new Date().toISOString().slice(0, 10)
    for (const row of doc.schedule) {
      ensure(16)
      const status = row.row_status === 'paid' ? 'Paid'
        : row.due_date && row.due_date < today ? 'Overdue'
        : row.row_status === 'partial' ? `Partly paid (${fmtMoney(row.allocated)})` : 'Due'
      text(`Payment ${row.sequence}`, M, y, 10)
      text(row.due_date ? `Due ${fmtDate(row.due_date)}` : 'No due date', 170, y, 10, font, MUTED)
      text(status, 330, y, 10, font, status === 'Paid' ? GREEN : status === 'Overdue' ? RED : MUTED)
      textRight(fmtMoney(row.amount), right - 8, y, 10)
      y -= 16
    }
    y -= 10
  }

  // ── Payments received ──────────────────────────────────────────────────
  if (doc.payments.length > 0) {
    sectionTitle('Payments received')
    for (const p of doc.payments) {
      ensure(16)
      text(fmtDate(p.paid_date), M, y, 10)
      if (p.method && PLATFORM_LABELS[p.method]) text(PLATFORM_LABELS[p.method], 170, y, 10, font, MUTED)
      textRight(fmtMoney(p.amount), right - 8, y, 10)
      y -= 16
    }
    y -= 10
  }

  // ── How to pay ─────────────────────────────────────────────────────────
  if (doc.status === 'sent' && doc.balance_due > 0 && doc.pay_platform && doc.pay_value) {
    sectionTitle('How to pay')
    const label = PLATFORM_LABELS[doc.pay_platform] || doc.pay_platform
    const amount = fmtMoney(doc.next_amount > 0 ? doc.next_amount : doc.balance_due)
    for (const line of wrap(`Pay ${amount} with ${label}: ${doc.pay_value}`, font, 10, CONTENT_W)) {
      ensure(14)
      text(line, M, y, 10)
      y -= 14
    }
    y -= 10
  }

  // ── Notes ──────────────────────────────────────────────────────────────
  if (doc.notes && doc.notes.trim()) {
    sectionTitle('Notes')
    for (const line of wrap(doc.notes, font, 10, CONTENT_W)) {
      ensure(14)
      text(line, M, y, 10, font, rgb(0.25, 0.27, 0.3))
      y -= 14
    }
  }

  // ── Footer on every page ───────────────────────────────────────────────
  pages.forEach((p, i) => {
    const label = clean(`${doc.business.name} · Invoice #${doc.invoice_number}`)
    p.drawText(label, { x: M, y: 28, size: 8, font, color: MUTED })
    if (pages.length > 1) {
      const n = `Page ${i + 1} of ${pages.length}`
      p.drawText(n, { x: PAGE_W - M - font.widthOfTextAtSize(n, 8), y: 28, size: 8, font, color: MUTED })
    }
  })

  return await pdf.save()
}
