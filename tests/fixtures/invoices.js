// tests/fixtures/invoices.js
//
// v1.6.0: helpers for the invoicing specs. Data is created with the service
// role, straight into the tables (the database still runs every invoice
// rule: numbering, client snapshot, locks, schedule total). Each helper
// works on this worker's account (PLAYWRIGHT_TEST_EMAIL, see base.js).

import { createClient } from '@supabase/supabase-js'

export function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

const uid = () => crypto.randomUUID().slice(0, 8)

export async function createInvoiceClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Invoice',
    last_name: `Client ${uid()}`,
    email: `invoice-test-${uid()}@example.com`,
    portal_token: crypto.randomUUID().replace(/-/g, ''),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function createInvoiceSession(clientId, overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('sessions').insert({
    photographer_id: photographerId,
    client_id: clientId,
    name: `Invoice Session ${uid()}`,
    type: 'Portrait',
    mode: 'private',
    status: 'booked',
    session_date: '2027-06-15',
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// lines: [{ title, unit_price, quantity?, taxable?, description? }]
// schedule: [{ amount, due_date }]  payments: [{ amount, paid_date, method? }]
// status 'draft' | 'sent' | 'void'. Returns the invoice row (with invoice_number).
export async function createInvoice({
  clientId, sessionId = null, status = 'sent', lines = [{ title: 'Portrait Session', unit_price: 200 }],
  schedule = [], payments = [], platform = null, dueDate = null, notes = null, taxRate = null, discountRate = null,
} = {}) {
  const photographerId = await getPhotographerId()
  const db = sb()
  const { data: inv, error } = await db.from('invoices').insert({
    photographer_id: photographerId, client_id: clientId, session_id: sessionId,
    status: 'draft', payment_platform: platform, due_date: dueDate, notes,
    tax_rate: taxRate, discount_rate: discountRate,
  }).select().single()
  if (error) throw new Error(`invoice: ${error.message}`)

  if (lines.length) {
    const { error: lErr } = await db.from('invoice_line_items').insert(lines.map((l, i) => ({
      invoice_id: inv.id, title: l.title, description: l.description ?? null,
      quantity: l.quantity ?? 1, unit_price: l.unit_price, taxable: l.taxable ?? false, sort_order: i,
    })))
    if (lErr) throw new Error(`lines: ${lErr.message}`)
  }
  if (schedule.length) {
    const { error: sErr } = await db.from('invoice_payment_schedule').insert(schedule.map((r, i) => ({
      invoice_id: inv.id, sequence: i + 1, amount: r.amount, due_date: r.due_date ?? null,
    })))
    if (sErr) throw new Error(`schedule: ${sErr.message}`)
  }
  if (status !== 'draft') {
    const { error: uErr } = await db.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
    if (uErr) throw new Error(`send: ${uErr.message}`)
  }
  if (payments.length) {
    const { error: pErr } = await db.from('invoice_payments').insert(payments.map(p => ({
      invoice_id: inv.id, amount: p.amount, paid_date: p.paid_date, method: p.method ?? null, note: p.note ?? null,
    })))
    if (pErr) throw new Error(`payments: ${pErr.message}`)
  }
  if (status === 'void') {
    const { error: vErr } = await db.from('invoices').update({ status: 'void' }).eq('id', inv.id)
    if (vErr) throw new Error(`void: ${vErr.message}`)
  }
  const { data: fresh } = await db.from('invoices').select('*').eq('id', inv.id).single()
  return fresh
}

// Service-role deletes skip the app-user delete rules (sql/109). Lines,
// schedule, payments and the email log cascade with the invoice.
export async function cleanupInvoices({ invoiceIds = [], clientIds = [], sessionIds = [] } = {}) {
  const db = sb()
  for (const id of clientIds) await db.from('invoices').delete().eq('client_id', id)
  for (const id of sessionIds) await db.from('invoices').delete().eq('session_id', id)
  if (invoiceIds.length) await db.from('invoices').delete().in('id', invoiceIds)
  for (const id of sessionIds) await db.from('sessions').delete().eq('id', id)
  for (const id of clientIds) await db.from('clients').delete().eq('id', id)
}

export async function setPaymentLinks(links, defaultPlatform = null) {
  const photographerId = await getPhotographerId()
  const { error } = await sb().from('photographers')
    .update({ payment_links: links, default_invoice_platform: defaultPlatform })
    .eq('id', photographerId)
  if (error) throw new Error(error.message)
}

export async function getPaymentLinks() {
  const photographerId = await getPhotographerId()
  const { data } = await sb().from('photographers').select('payment_links, default_invoice_platform').eq('id', photographerId).single()
  return data
}

export function isoDaysFromToday(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
