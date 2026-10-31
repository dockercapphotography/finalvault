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
