import { supabase } from '../supabaseClient.js'

// ── Invoice emails (v1.6.0 step 9) ───────────────────────────────────────
// Templates (sql/118 invoice_email_templates, two kinds), the send log, and
// the call to the send-invoice Edge Function (which attaches the PDF).

export const INVOICE_EMAIL_KINDS = {
  invoice: { label: 'Invoice Emails', noun: 'invoice email' },
  reminder: { label: 'Payment Reminders', noun: 'payment reminder' },
}

export const INVOICE_EMAIL_VARIABLES = [
  { tag: '{{client_first_name}}', desc: 'Client first name' },
  { tag: '{{client_name}}', desc: 'Full client name' },
  { tag: '{{invoice_number}}', desc: 'Invoice number' },
  { tag: '{{invoice_total}}', desc: 'Invoice total' },
  { tag: '{{amount_due}}', desc: 'Amount due now (next installment)' },
  { tag: '{{balance_due}}', desc: 'Total balance left' },
  { tag: '{{due_date}}', desc: 'Due date' },
  { tag: '{{session_name}}', desc: 'Session name' },
  { tag: '{{studio_name}}', desc: 'Your business name' },
  { tag: '{{photographer_name}}', desc: 'Your display name' },
]

// Used when the photographer has no template of that kind yet.
export const BUILT_IN_INVOICE_EMAILS = {
  invoice: {
    name: 'Default message',
    subject: 'Invoice #{{invoice_number}} from {{studio_name}}',
    body: "Hi {{client_first_name}},\n\nHere's your invoice for {{session_name}}. **{{amount_due}}** is due {{due_date}}.\n\nYou'll find the details below and a PDF copy attached. Let me know if you have any questions!\n\n— {{studio_name}}",
  },
  reminder: {
    name: 'Default message',
    subject: 'Reminder: {{amount_due}} due {{due_date}} (Invoice #{{invoice_number}})',
    body: "Hi {{client_first_name}},\n\nJust a friendly reminder that **{{amount_due}}** for {{session_name}} is due {{due_date}}.\n\nIf you've already sent it, thank you, and please ignore this email!\n\n— {{studio_name}}",
  },
}

// ctx: { client_first_name, client_name, invoice_number, invoice_total,
//        amount_due, balance_due, due_date, session_name, studio_name,
//        photographer_name } -- already formatted strings.
// An empty value removes the tag; a sentence like "for {{session_name}}"
// on a standalone invoice is tidied to read naturally.
export function resolveInvoiceEmail(text, ctx) {
  let out = String(text || '')
  if (!ctx.session_name) out = out.replace(/ for \{\{session_name\}\}/g, '')
  if (!ctx.due_date) out = out.replace(/ (is )?due \{\{due_date\}\}/g, (m, is) => (is ? ' is due' : ''))
  return out.replace(/\{\{(\w+)\}\}/g, (tag, key) => (key in ctx ? (ctx[key] ?? '') : tag))
}

// ── Templates ────────────────────────────────────────────────────────

export async function getInvoiceEmailTemplates(kind) {
  let query = supabase.from('invoice_email_templates').select('*').order('name', { ascending: true })
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createInvoiceEmailTemplate(kind, { name, subject, body }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('invoice_email_templates')
    .insert({ photographer_id: user.id, kind, name: name.trim(), subject: subject.trim(), body: (body || '').trim() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInvoiceEmailTemplate(id, { name, subject, body }) {
  const updates = {}
  if (name !== undefined) updates.name = name.trim()
  if (subject !== undefined) updates.subject = subject.trim()
  if (body !== undefined) updates.body = body.trim()
  const { data, error } = await supabase
    .from('invoice_email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInvoiceEmailTemplate(id) {
  const { error } = await supabase.from('invoice_email_templates').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateInvoiceEmailTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('invoice_email_templates')
    .insert({
      photographer_id: user.id, kind: template.kind, name: `${template.name} (Copy)`,
      subject: template.subject, body: template.body, is_default: false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// templateId null clears the default for that kind.
export async function setDefaultInvoiceEmailTemplate(kind, templateId) {
  const { error } = await supabase.rpc('set_default_invoice_email_template', { p_kind: kind, p_template_id: templateId })
  if (error) throw error
}

// ── Sending ──────────────────────────────────────────────────────────

export async function getInvoiceEmailLog(invoiceId) {
  const { data, error } = await supabase
    .from('invoice_email_log')
    .select('kind, sent_to, sent_at, pdf_attached')
    .eq('invoice_id', invoiceId)
    .order('sent_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// { invoiceId, kind, to, subject, message, attachPdf } -> { ok, emailId, portalLink }
export async function sendInvoiceEmail(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session has expired. Sign in again.')
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  })
  const result = await resp.json().catch(() => ({}))
  if (!resp.ok || !result.ok) throw new Error(result.error || "The email couldn't be sent.")
  return result
}

export async function getSenderNames() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('photographers').select('display_name, business_name').eq('id', user.id).single()
  return {
    studio_name: data?.business_name || data?.display_name || '',
    photographer_name: data?.display_name || data?.business_name || '',
  }
}
