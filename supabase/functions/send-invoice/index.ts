// supabase/functions/send-invoice/index.ts
//
// v1.6.0 step 9: emails an invoice or a payment reminder to the client.
//
// POST { invoiceId, kind: 'invoice' | 'reminder', to, subject, message, attachPdf }
//   Authorization: the photographer's access token. The invoice must be
//   theirs and already sent (the editor saves it as sent first; "Mark as
//   sent without emailing" simply never calls this). Reminders need a
//   balance left to pay.
//
// `to` is editable in the Send dialog for this one send only; it isn't
// written back to the client. subject/message arrive with variables
// already filled in. Replies go to the photographer's business email
// (or their login email) instead of the no-reply sender.
//
// Every successful send is recorded in invoice_email_log (sql/118).
//
// Deploy: supabase functions deploy send-invoice

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { safeFromName } from '../_shared/escapeHtml.ts'
import { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'
import { loadInvoiceForPhotographer, fetchLogo, renderInvoicePdf } from '../_shared/invoicePdf.ts'
import { buildInvoiceEmailHtml, toBase64 } from '../_shared/invoiceEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } }
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const invoiceId = body.invoiceId
    const kind = body.kind === 'reminder' ? 'reminder' : 'invoice'
    const to = String(body.to || '').trim()
    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim()
    const message = String(body.message || '')
    const attachPdf = body.attachPdf !== false

    if (typeof invoiceId !== 'string' || !UUID.test(invoiceId)) return json({ error: 'Missing invoiceId' }, 400)
    if (!EMAIL.test(to) || to.length > 254) return json({ error: 'Enter one valid email address.' }, 400)
    if (!subject) return json({ error: 'Add a subject.' }, 400)
    if (subject.length > 200) return json({ error: 'The subject is too long (200 characters max).' }, 400)
    if (message.length > 10000) return json({ error: 'The message is too long.' }, 400)

    // Ownership + current state in one place (same loader as the PDF).
    const doc = await loadInvoiceForPhotographer(supabase, invoiceId, user.id)
    if (!doc) return json({ error: 'Invoice not found' }, 404)
    if (doc.status === 'draft') return json({ error: 'Send the invoice before emailing it.' }, 409)
    if (doc.status === 'void') return json({ error: "A void invoice can't be emailed." }, 409)
    if (kind === 'reminder' && doc.balance_due <= 0) return json({ error: 'This invoice is already paid in full.' }, 409)

    const { data: inv } = await supabase
      .from('invoices').select('client_id').eq('id', invoiceId).eq('photographer_id', user.id).single()
    const { data: client } = inv?.client_id
      ? await supabase.from('clients').select('portal_token').eq('id', inv.client_id).maybeSingle()
      : { data: null }

    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const baseUrl = await getPublicBaseUrl(supabase, user.id)
    const portalUrl = client?.portal_token
      ? `${baseUrl}/client/${encodeURIComponent(client.portal_token)}/invoices/${invoiceId}`
      : null
    const logoUrl = doc.business.logoKey ? `${workerUrl}/logo/${encodeURIComponent(doc.business.logoKey)}` : null

    let attachments: { filename: string; content: string }[] | undefined
    if (attachPdf) {
      const pdf = await renderInvoicePdf(doc, await fetchLogo(workerUrl, doc.business.logoKey))
      attachments = [{ filename: `invoice-${doc.invoice_number}.pdf`, content: toBase64(pdf) }]
    }

    // A brand-new invoice is emailed straight after its first save, before
    // the dialog knew its number, so {{invoice_number}} can still be here.
    const fillNumber = (s: string) => s.replace(/\{\{invoice_number\}\}/g, String(doc.invoice_number))
    const finalSubject = fillNumber(subject)
    const finalMessage = fillNumber(message)

    const html = buildInvoiceEmailHtml({ doc, message: finalMessage, logoUrl, portalUrl, pdfAttached: Boolean(attachments), kind })

    const replyTo = (doc.business.email && EMAIL.test(doc.business.email)) ? doc.business.email : user.email
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${safeFromName(doc.business.name)} <noreply@mail.final-vault.app>`,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: finalSubject,
        html,
        ...(attachments ? { attachments } : {}),
      }),
    })
    const resData = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('Resend error:', resData)
      return json({ error: "The email couldn't be sent. Try again in a moment." }, 502)
    }

    const { error: logError } = await supabase.from('invoice_email_log').insert({
      invoice_id: invoiceId,
      photographer_id: user.id,
      kind,
      sent_to: to,
      subject: finalSubject,
      pdf_attached: Boolean(attachments),
      resend_id: resData.id ?? null,
    })
    if (logError) console.error('invoice_email_log insert failed:', logError)

    return json({ ok: true, emailId: resData.id ?? null, portalLink: Boolean(portalUrl) })
  } catch (err) {
    console.error('send-invoice failed:', err)
    return json({ error: 'Something went wrong sending the email.' }, 500)
  }
})
