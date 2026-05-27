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
    const { galleryId, recipients, subject, message, includePassword, includePin } = await req.json()

    if (!galleryId || !recipients?.length) {
      return new Response(JSON.stringify({ error: 'Missing galleryId or recipients' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Auth — only the gallery owner can send
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the requesting user owns this gallery
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: gallery } = await supabase
      .from('galleries')
      .select('id, title, client_name, share_token, require_password, plain_password, require_download_pin, plain_download_pin, photographer_id')
      .eq('id', galleryId)
      .eq('photographer_id', user.id)
      .single()

    if (!gallery) return new Response(JSON.stringify({ error: 'Gallery not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: photographer } = await supabase
      .from('photographers')
      .select('display_name, business_name')
      .eq('id', user.id)
      .single()

    const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'
    const galleryUrl = `https://finalvault.dockercapphotography.com/g/${gallery.share_token}`

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

    const results = []
    for (const recipient of recipients) {
      const email = typeof recipient === 'string' ? recipient : recipient.email
      const name = typeof recipient === 'object' ? recipient.name : null

      const clientName = name || gallery.client_name || 'there'
      const vars: Record<string, string> = {
        gallery_name: gallery.title,
        client_name: clientName,
        event_date: gallery.event_date ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
        my_name: photographer?.display_name || senderName,
        business_name: photographer?.business_name || senderName,
        gallery_url: galleryUrl,
        password: (includePassword && gallery.plain_password) ? gallery.plain_password : '',
        download_pin: (includePin && gallery.plain_download_pin) ? gallery.plain_download_pin : '',
      }

      const finalSubject = substituteVariables(subject || `Your gallery is ready — ${gallery.title}`, vars)
      const finalMessage = substituteVariables(message || '', vars)

      const html = buildEmailHtml({
        senderName,
        galleryTitle: gallery.title,
        clientName,
        galleryUrl,
        password: includePassword && gallery.require_password ? gallery.plain_password : null,
        downloadPin: includePin && gallery.require_download_pin ? gallery.plain_download_pin : null,
        customMessage: finalMessage || null,
      })

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${senderName} <noreply@dockercapphotography.com>`,
          to: [email],
          subject: finalSubject,
          html,
        }),
      })

      const data = await res.json()
      results.push({ email, ok: res.ok, id: data.id, error: data.message })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function substituteVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function buildEmailHtml({ senderName, galleryTitle, clientName, galleryUrl, password, downloadPin, customMessage }: {
  senderName: string
  galleryTitle: string
  clientName: string
  galleryUrl: string
  password: string | null
  downloadPin: string | null
  customMessage: string | null
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${galleryTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:32px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${senderName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;color:#111111;font-size:24px;font-weight:700;">Hi ${clientName} 👋</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:16px;line-height:1.6;">Your gallery is ready to view.</p>

            ${customMessage ? `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;padding:16px;background:#f9fafb;border-radius:8px;border-left:3px solid #6366f1;">${customMessage}</p>` : ''}

            <!-- Gallery title -->
            <p style="margin:0 0 24px;color:#111111;font-size:18px;font-weight:600;">${galleryTitle}</p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td style="background:#6366f1;border-radius:10px;">
                  <a href="${galleryUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">View Your Gallery →</a>
                </td>
              </tr>
            </table>

            <!-- Access details -->
            ${password || downloadPin ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 12px;color:#111111;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Access Details</p>
                ${password ? `
                <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                  <tr>
                    <td style="color:#6b7280;font-size:14px;width:120px;">Gallery Password</td>
                    <td style="color:#111111;font-size:14px;font-weight:600;font-family:monospace;letter-spacing:0.1em;">${password}</td>
                  </tr>
                </table>` : ''}
                ${downloadPin ? `
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#6b7280;font-size:14px;width:120px;">Download PIN</td>
                    <td style="color:#111111;font-size:14px;font-weight:600;font-family:monospace;letter-spacing:0.2em;">${downloadPin}</td>
                  </tr>
                </table>` : ''}
              </td></tr>
            </table>` : ''}

            <!-- Gallery URL -->
            <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Or copy this link:</p>
            <p style="margin:0;color:#6366f1;font-size:13px;word-break:break-all;">${galleryUrl}</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Delivered by FinalVault · <a href="${galleryUrl}" style="color:#9ca3af;">View gallery</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
