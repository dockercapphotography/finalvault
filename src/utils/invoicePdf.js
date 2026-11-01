import { supabase } from '../supabaseClient.js'
import { getStoredPortalPassword } from './clientApi.js'

// ── Invoice PDF downloads (v1.6.0) ───────────────────────────────────────
// The PDF is built on demand by the invoice-pdf Edge Function from the
// invoice as it is right now (payments included); nothing is stored.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invoice-pdf`

async function fetchPdf(body, accessToken) {
  const resp = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    let message = 'Could not download the PDF. Try again in a moment.'
    try {
      const err = await resp.json()
      if (resp.status === 401 && body.portalToken) message = 'Enter your portal password again, then retry.'
      else if (err?.error && resp.status !== 500) message = err.error
    } catch {
      // not JSON -- keep the general message
    }
    throw new Error(message)
  }
  return resp.blob()
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Photographer (editor): any of their invoices, any status.
export async function downloadInvoicePdf(invoiceId, invoiceNumber) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session has expired. Sign in again.')
  const blob = await fetchPdf({ invoiceId }, session.access_token)
  saveBlob(blob, `invoice-${invoiceNumber}.pdf`)
}

// Client portal: the portal token (+ the password typed this tab session).
export async function downloadPortalInvoicePdf(token, invoiceId, invoiceNumber) {
  const blob = await fetchPdf(
    { invoiceId, portalToken: token, portalPassword: getStoredPortalPassword(token) },
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
  saveBlob(blob, `invoice-${invoiceNumber}.pdf`)
}
