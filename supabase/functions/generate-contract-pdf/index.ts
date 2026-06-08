import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { contractId } = await req.json()
    if (!contractId) {
      return new Response(JSON.stringify({ error: 'Missing contractId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, clients(*), photographers(display_name, business_name)')
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (contract.status !== 'signed') {
      return new Response(JSON.stringify({ error: 'Contract is not fully signed yet' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const senderName = contract.photographers?.business_name || contract.photographers?.display_name || 'Photographer'
    const clientName = contract.clients
      ? `${contract.clients.first_name} ${contract.clients.last_name}`
      : 'Client'

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)

    const PAGE_WIDTH = 612
    const PAGE_HEIGHT = 792
    const MARGIN = 60
    const LINE_HEIGHT = 16
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    let y = PAGE_HEIGHT - MARGIN

    function addFooter(p: ReturnType<typeof pdfDoc.addPage>) {
      p.drawText(`FinalVault · Contract ID: ${contractId}`, {
        x: MARGIN, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6),
      })
      p.drawText(`SHA-256: ${contract.body_hash}`, {
        x: MARGIN, y: 18, size: 7, font: fontMono, color: rgb(0.7, 0.7, 0.7),
      })
    }

    function checkNewPage(needed = LINE_HEIGHT) {
      if (y - needed < MARGIN + 60) {
        addFooter(page)
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        y = PAGE_HEIGHT - MARGIN
      }
    }

    function wrapText(text: string, maxWidth: number, fontSize: number, f: typeof font): string[] {
      const words = text.split(' ')
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (f.widthOfTextAtSize(test, fontSize) > maxWidth && current) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
      return lines.length ? lines : ['']
    }

    // Header
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 50, width: PAGE_WIDTH, height: 50, color: rgb(0.067, 0.067, 0.067) })
    page.drawText(senderName.toUpperCase(), { x: MARGIN, y: PAGE_HEIGHT - 32, size: 11, font: fontBold, color: rgb(1, 1, 1) })
    y = PAGE_HEIGHT - MARGIN - 40

    page.drawText(contract.title, { x: MARGIN, y, size: 18, font: fontBold, color: rgb(0.067, 0.067, 0.067) })
    y -= 28

    const metaStr = [`Client: ${clientName}`, contract.signed_at ? `Signed: ${new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''].filter(Boolean).join('  ·  ')
    page.drawText(metaStr, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 24

    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
    y -= 20

    for (const rawLine of contract.body.split('\n')) {
      if (!rawLine.trim()) { y -= LINE_HEIGHT * 0.6; checkNewPage(); continue }
      const isHeader = /^[A-Z\s&\/]{4,}$/.test(rawLine.trim()) && !rawLine.includes('.')
      const wrapped = wrapText(rawLine, CONTENT_WIDTH, 10, isHeader ? fontBold : font)
      for (const line of wrapped) {
        checkNewPage()
        page.drawText(line, { x: MARGIN, y, size: 10, font: isHeader ? fontBold : font, color: isHeader ? rgb(0.15, 0.15, 0.15) : rgb(0.2, 0.2, 0.2) })
        y -= LINE_HEIGHT
      }
    }

    y -= 20
    checkNewPage(140)
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) })
    y -= 20
    page.drawText('SIGNATURES', { x: MARGIN, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
    y -= 20

    page.drawText('Client Signature', { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
    y -= 14
    page.drawText(`Signed by: ${contract.signed_name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) })
    y -= 14
    page.drawText(`Date: ${new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 12
    if (contract.signed_ip) { page.drawText(`IP: ${contract.signed_ip}`, { x: MARGIN, y, size: 9, font: fontMono, color: rgb(0.5, 0.5, 0.5) }); y -= 12 }
    y -= 16

    page.drawText('Counter-Signature (Photographer)', { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
    y -= 14
    page.drawText(`Signed by: ${contract.photographer_signed_name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) })
    y -= 14
    page.drawText(`Date: ${new Date(contract.photographer_signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 24

    checkNewPage(44)
    page.drawRectangle({ x: MARGIN, y: y - 32, width: CONTENT_WIDTH, height: 38, color: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 })
    page.drawText('Tamper-evident document. The SHA-256 hash below identifies the exact contract body that was signed.', { x: MARGIN + 8, y: y - 14, size: 7.5, font, color: rgb(0.5, 0.5, 0.5) })
    page.drawText(`Hash: ${contract.body_hash}`, { x: MARGIN + 8, y: y - 26, size: 7, font: fontMono, color: rgb(0.55, 0.55, 0.55) })
    addFooter(page)

    // ── Upload to R2 ──────────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save()
    const r2Key = `photographers/${contract.photographer_id}/contracts/${contractId}.pdf`
    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const formData = new FormData()
    formData.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), `${contractId}.pdf`)
    formData.append('key', r2Key)

    const uploadResp = await fetch(`${workerUrl}/upload-pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}` },
      body: formData,
    })

    if (!uploadResp.ok) {
      const errBody = await uploadResp.json().catch(() => ({}))
      console.error('R2 PDF upload failed:', errBody)
      return new Response(JSON.stringify({ ok: false, error: 'PDF upload failed', detail: errBody }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await supabase.from('contracts').update({ pdf_r2_key: r2Key, updated_at: new Date().toISOString() }).eq('id', contractId)

    // ── Send confirmation emails with PDF attached ────────────────────────────
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
    const signedDate = new Date(contract.photographer_signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const attachment = { filename: `${contract.title.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: pdfBase64, type: 'application/pdf' }

    // Get photographer email
    const { data: { user: photographerUser } } = await supabase.auth.admin.getUserById(contract.photographer_id)
    const photographerEmail = photographerUser?.email

    const clientEmail = contract.clients?.email
    const clientFirstName = contract.clients?.first_name || 'there'

    const confirmedHtml = (recipientName: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:560px;">
        <tr><td style="background:#111;padding:24px 40px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>
        </td></tr>
        <tr><td style="padding:36px 40px 32px;">
          <p style="margin:0 0 16px;color:#111;font-size:20px;font-weight:700;">Contract fully signed</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
          <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
            <strong>${contract.title}</strong> has been signed by both parties on ${signedDate}.
            A copy of the signed contract is attached to this email as a PDF.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
            <p style="margin:0;color:#15803d;font-size:13px;">
              ✓ This contract is legally binding under US ESIGN/UETA.
            </p>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;">
            Client: ${clientName} · Photographer: ${contract.photographer_signed_name} · ${signedDate}
          </p>
        </td></tr>
        <tr><td style="padding:16px 40px;border-top:1px solid #f0f0f0;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Sent via FinalVault</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    const emailPromises = []

    if (clientEmail) {
      emailPromises.push(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${senderName} <noreply@dockercapphotography.com>`,
          to: [clientEmail],
          subject: `Signed contract: ${contract.title}`,
          html: confirmedHtml(clientFirstName),
          attachments: [attachment],
        }),
      }))
    }

    if (photographerEmail) {
      emailPromises.push(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `FinalVault <noreply@dockercapphotography.com>`,
          to: [photographerEmail],
          subject: `Fully signed: ${contract.title}`,
          html: confirmedHtml(contract.photographers?.display_name || 'there'),
          attachments: [attachment],
        }),
      }))
    }

    await Promise.allSettled(emailPromises)

    return new Response(JSON.stringify({ ok: true, r2Key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error', detail: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
