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

    // Load fully signed contract
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

    // Header bar
    page.drawRectangle({
      x: 0, y: PAGE_HEIGHT - 50, width: PAGE_WIDTH, height: 50,
      color: rgb(0.067, 0.067, 0.067),
    })
    page.drawText(senderName.toUpperCase(), {
      x: MARGIN, y: PAGE_HEIGHT - 32, size: 11, font: fontBold, color: rgb(1, 1, 1),
    })
    y = PAGE_HEIGHT - MARGIN - 40

    // Title
    page.drawText(contract.title, {
      x: MARGIN, y, size: 18, font: fontBold, color: rgb(0.067, 0.067, 0.067),
    })
    y -= 28

    // Meta
    const metaStr = [
      `Client: ${clientName}`,
      contract.signed_at
        ? `Signed: ${new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
        : '',
    ].filter(Boolean).join('  ·  ')
    page.drawText(metaStr, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 24

    // Divider
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1, color: rgb(0.85, 0.85, 0.85),
    })
    y -= 20

    // Body
    for (const rawLine of contract.body.split('\n')) {
      if (!rawLine.trim()) { y -= LINE_HEIGHT * 0.6; checkNewPage(); continue }
      const isHeader = /^[A-Z\s&\/]{4,}$/.test(rawLine.trim()) && !rawLine.includes('.')
      const wrapped = wrapText(rawLine, CONTENT_WIDTH, 10, isHeader ? fontBold : font)
      for (const line of wrapped) {
        checkNewPage()
        page.drawText(line, {
          x: MARGIN, y, size: 10,
          font: isHeader ? fontBold : font,
          color: isHeader ? rgb(0.15, 0.15, 0.15) : rgb(0.2, 0.2, 0.2),
        })
        y -= LINE_HEIGHT
      }
    }

    // Signature block
    y -= 20
    checkNewPage(140)

    page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1, color: rgb(0.85, 0.85, 0.85),
    })
    y -= 20

    page.drawText('SIGNATURES', { x: MARGIN, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
    y -= 20

    // Client sig
    page.drawText('Client Signature', { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
    y -= 14
    page.drawText(`Signed by: ${contract.signed_name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) })
    y -= 14
    page.drawText(`Date: ${new Date(contract.signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, {
      x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    })
    y -= 12
    if (contract.signed_ip) {
      page.drawText(`IP: ${contract.signed_ip}`, { x: MARGIN, y, size: 9, font: fontMono, color: rgb(0.5, 0.5, 0.5) })
      y -= 12
    }
    y -= 16

    // Photographer counter-sig
    page.drawText('Counter-Signature (Photographer)', { x: MARGIN, y, size: 9, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
    y -= 14
    page.drawText(`Signed by: ${contract.photographer_signed_name}`, { x: MARGIN, y, size: 10, font, color: rgb(0.15, 0.15, 0.15) })
    y -= 14
    page.drawText(`Date: ${new Date(contract.photographer_signed_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, {
      x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    })
    y -= 24

    // Tamper notice box
    checkNewPage(44)
    page.drawRectangle({
      x: MARGIN, y: y - 32, width: CONTENT_WIDTH, height: 38,
      color: rgb(0.98, 0.98, 0.98), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1,
    })
    page.drawText('Tamper-evident document. The SHA-256 hash below identifies the exact contract body that was signed.', {
      x: MARGIN + 8, y: y - 14, size: 7.5, font, color: rgb(0.5, 0.5, 0.5),
    })
    page.drawText(`Hash: ${contract.body_hash}`, {
      x: MARGIN + 8, y: y - 26, size: 7, font: fontMono, color: rgb(0.55, 0.55, 0.55),
    })

    addFooter(page)

    // ── Upload to R2 via /upload-pdf ──────────────────────────────────────────
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

    // Save R2 key to contract record
    await supabase
      .from('contracts')
      .update({ pdf_r2_key: r2Key, updated_at: new Date().toISOString() })
      .eq('id', contractId)

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
