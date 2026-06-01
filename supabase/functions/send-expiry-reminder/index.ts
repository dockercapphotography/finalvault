import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const appUrl = 'https://finalvault.dockercapphotography.com'
    const now = new Date()

    // Find all active galleries with expiry warnings enabled and an expiry date set
    const { data: galleries, error: galleriesErr } = await supabase
      .from('galleries')
      .select(`
        id, title, share_token, expires_at, expiry_warning_days,
        require_password, plain_password, require_download_pin, plain_download_pin,
        cover_r2_key, cover_image_id, event_name, event_date, client_name,
        photographer_id
      `)
      .eq('is_active', true)
      .eq('expiry_warning_enabled', true)
      .not('expires_at', 'is', null)

    if (galleriesErr) throw galleriesErr
    if (!galleries?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 0, reason: 'no galleries' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let sent = 0
    let skipped = 0

    for (const gallery of galleries) {
      const expiresAt = new Date(gallery.expires_at)
      const msUntilExpiry = expiresAt.getTime() - now.getTime()
      const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24)

      // Match if we're within the warning window day — e.g. warning_days=1 fires when 0-2 days remain
      const lower = gallery.expiry_warning_days - 1
      const upper = gallery.expiry_warning_days
      if (daysUntilExpiry < lower || daysUntilExpiry >= upper + 1) {
        skipped++
        continue
      }
      const daysLabel = Math.round(daysUntilExpiry)

      // Get all viewers with emails for this gallery
      const { data: viewers } = await supabase
        .from('gallery_viewers')
        .select('id, display_name, email')
        .eq('gallery_id', gallery.id)
        .not('email', 'is', null)

      if (!viewers?.length) {
        console.log(`Gallery ${gallery.id}: no viewers with email, skipping`)
        skipped++
        continue
      }

      // Get photographer info for sender name
      const { data: photographer } = await supabase
        .from('photographers')
        .select('display_name, business_name')
        .eq('id', gallery.photographer_id)
        .single()

      const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'

      // Resolve cover image
      let coverImageUrl: string | null = null
      if (gallery.cover_r2_key) {
        coverImageUrl = `${workerUrl}/preview/${encodeURIComponent(gallery.cover_r2_key)}?share_token=${gallery.share_token}`
      } else if (gallery.cover_image_id) {
        const { data: coverImg } = await supabase
          .from('gallery_images')
          .select('preview_r2_key')
          .eq('id', gallery.cover_image_id)
          .single()
        if (coverImg?.preview_r2_key) {
          coverImageUrl = `${workerUrl}/preview/${encodeURIComponent(coverImg.preview_r2_key)}?share_token=${gallery.share_token}`
        }
      }

      const galleryUrl = `${appUrl}/g/${gallery.share_token}`
      const expiryDateStr = expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      const eventDateStr = gallery.event_date
        ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : ''

      // Send to each viewer
      for (const viewer of viewers) {
        const clientName = viewer.display_name || 'there'

        const html = buildExpiryEmailHtml({
          senderName,
          galleryTitle: gallery.title,
          clientName,
          eventName: gallery.event_name || '',
          eventDate: eventDateStr,
          galleryUrl,
          coverImageUrl,
          expiryDate: expiryDateStr,
          daysUntilExpiry: daysLabel,
          password: gallery.require_password ? gallery.plain_password : null,
          downloadPin: gallery.require_download_pin ? gallery.plain_download_pin : null,
        })

        const subject = daysLabel <= 1
          ? `Last chance — your gallery expires tomorrow`
          : `Your gallery expires in ${daysLabel} days — ${gallery.title}`

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${senderName} <noreply@dockercapphotography.com>`,
            to: [viewer.email],
            subject,
            html,
          }),
        })

        if (res.ok) {
          sent++
          console.log(`Sent expiry warning to ${viewer.email} for gallery "${gallery.title}" (${daysUntilExpiry} days)`)
        } else {
          const err = await res.json()
          console.error(`Failed to send to ${viewer.email}:`, err)
          skipped++
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildExpiryEmailHtml({ senderName, galleryTitle, clientName, eventName, eventDate, galleryUrl, coverImageUrl, expiryDate, daysUntilExpiry, password, downloadPin }: {
  senderName: string
  galleryTitle: string
  clientName: string
  eventName: string
  eventDate: string
  galleryUrl: string
  coverImageUrl: string | null
  expiryDate: string
  daysUntilExpiry: number
  password: string | null
  downloadPin: string | null
}) {
  const urgencyColor = daysUntilExpiry <= 1 ? '#dc2626' : daysUntilExpiry <= 3 ? '#d97706' : '#6366f1'
  const urgencyBg   = daysUntilExpiry <= 1 ? '#fef2f2' : daysUntilExpiry <= 3 ? '#fffbeb' : '#eef2ff'
  const urgencyText = daysUntilExpiry <= 1
    ? 'Your gallery expires tomorrow — download your images now.'
    : `Your gallery expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} on ${expiryDate}.`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your gallery is expiring soon</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>
          </td>
        </tr>

        <!-- Cover image -->
        ${coverImageUrl ? `
        <tr>
          <td style="padding:0;line-height:0;">
            <img src="${coverImageUrl}" alt="${galleryTitle}" width="560" style="display:block;width:100%;max-height:280px;object-fit:cover;" />
          </td>
        </tr>` : ''}

        <!-- Gallery title -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <p style="margin:0 0 6px;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">${galleryTitle}</p>
            ${[eventName, eventDate].filter(Boolean).length > 0 ? `<p style="margin:0;color:#6b7280;font-size:13px;">${[eventName, eventDate].filter(Boolean).join(' &middot; ')}</p>` : ''}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 40px 32px;">

            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">Hi ${clientName},</p>

            <!-- Urgency banner -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:${urgencyBg};border-radius:10px;border:1px solid ${urgencyColor}20;padding:14px 16px;">
                  <p style="margin:0;color:${urgencyColor};font-size:14px;font-weight:600;">${urgencyText}</p>
                  <p style="margin:4px 0 0;color:${urgencyColor}99;font-size:13px;">Make sure you've downloaded everything you want to keep before it's gone.</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
              <tr>
                <td style="background:#111111;border-radius:8px;text-align:center;">
                  <a href="${galleryUrl}" style="display:block;padding:16px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Download My Images</a>
                </td>
              </tr>
            </table>

            <!-- Access details if needed -->
            ${password || downloadPin ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td>
                <p style="margin:0 0 10px;color:#111111;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Access Details</p>
                ${password ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                  <tr><td style="padding:12px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Gallery Password</p>
                    <p style="margin:0;color:#111111;font-size:20px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:0.15em;">${password}</p>
                  </td></tr>
                </table>` : ''}
                ${downloadPin ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                  <tr><td style="padding:12px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Download PIN</p>
                    <p style="margin:0;color:#111111;font-size:28px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:0.3em;">${downloadPin}</p>
                  </td></tr>
                </table>` : ''}
              </td></tr>
            </table>` : ''}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">${senderName} &nbsp;&middot;&nbsp; <a href="${galleryUrl}" style="color:#9ca3af;text-decoration:none;">View gallery</a> &nbsp;&middot;&nbsp; Questions? Reply to this email.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
