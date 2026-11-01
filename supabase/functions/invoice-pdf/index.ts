// supabase/functions/invoice-pdf/index.ts
//
// v1.6.0: POST { invoiceId, portalToken?, portalPassword? } -> application/pdf
//
// Built fresh on every request from the current invoice (see
// _shared/invoicePdf.ts); nothing is stored in R2.
//
// Who may download:
//   * The signed-in photographer who owns the invoice (Authorization: their
//     access token). Any status; drafts and voids are labelled on the page.
//   * A client, with their portal token -- and the portal password when one
//     is set -- checked by get_client_portal_data itself, so it's the same
//     gate and lockout as the portal and only that client's sent invoices.
//
// Deploy: supabase functions deploy invoice-pdf
// (JWT verification stays on: the portal sends the anon key, the editor
//  sends the photographer's token; ownership is checked below either way.)

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  loadInvoiceForPhotographer, loadInvoiceForPortal, fetchLogo, renderInvoicePdf,
} from '../_shared/invoicePdf.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'content-disposition',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { invoiceId, portalToken, portalPassword } = await req.json().catch(() => ({}))
    if (typeof invoiceId !== 'string' || !UUID.test(invoiceId)) return json({ error: 'Missing invoiceId' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let doc
    if (typeof portalToken === 'string' && portalToken) {
      const result = await loadInvoiceForPortal(
        supabase, portalToken, typeof portalPassword === 'string' && portalPassword ? portalPassword : null, invoiceId,
      )
      if (!result.ok) return json({ error: result.error }, result.status)
      doc = result.doc
    } else {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data: { user } } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } }
      if (!user) return json({ error: 'Unauthorized' }, 401)
      doc = await loadInvoiceForPhotographer(supabase, invoiceId, user.id)
      // Same answer for "doesn't exist" and "not yours".
      if (!doc) return json({ error: 'Invoice not found' }, 404)
    }

    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const logo = await fetchLogo(workerUrl, doc.business.logoKey)
    const bytes = await renderInvoicePdf(doc, logo)

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${doc.invoice_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('invoice-pdf failed:', err)
    return json({ error: 'Could not build the PDF' }, 500)
  }
})
