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
    const { sessionId, questionnaireId } = await req.json()

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

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch session with client and photographer
    const { data: session } = await supabase
      .from('sessions')
      .select(`
        id, name, description, submit_token, session_date, start_time, location,
        clients ( first_name, last_name, email ),
        photographers ( display_name, business_name, logo_r2_key )
      `)
      .eq('id', sessionId)
      .eq('photographer_id', user.id)
      .single()

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!session.submit_token) {
      return new Response(JSON.stringify({ error: 'Session has no submission form' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const client = session.clients as { first_name: string; last_name: string; email: string } | null
    if (!client?.email) {
      return new Response(JSON.stringify({ error: 'Client has no email address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const photographer = session.photographers as { display_name: string; business_name: string } | null
    const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'
    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const logoUrl = photographer?.logo_r2_key
      ? `${workerUrl}/logo/${encodeURIComponent(photographer.logo_r2_key)}`
      : null
    const clientName = `${client.first_name} ${client.last_name}`
    const formUrl = 'https://finalvault.dockercapphotography.com/submit/' + session.submit_token + (questionnaireId ? '?q=' + questionnaireId : '')

    // Format session date if present
    let sessionDateStr = ''
    if (session.session_date) {
      sessionDateStr = new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })
      if (session.start_time) {
        const [h, m] = session.start_time.split(':')
        const hour = parseInt(h)
        sessionDateStr += ` at ${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
      }
    }

    const html = buildEmailHtml({
      senderName,
      logoUrl,
      sessionName: session.name,
      clientName,
      formUrl,
      sessionDate: sessionDateStr,
      location: session.location || null,
      description: session.description || null,
    })

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@dockercapphotography.com>`,
        to: [client.email],
        subject: `Action needed — ${session.name}`,
        html,
      }),
    })

    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Send failed')

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildEmailHtml({ senderName, logoUrl, sessionName, clientName, formUrl, sessionDate, location, description }: {
  senderName: string
  logoUrl: string | null
  sessionName: string
  clientName: string
  formUrl: string
  sessionDate: string
  location: string | null
  description: string | null
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sessionName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:28px 40px;text-align:center;">
            ${logoUrl
              ? `<img src="${logoUrl}" alt="${senderName}" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />`
              : `<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>`
            }
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 6px;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${sessionName}</p>
            ${sessionDate ? `<p style="margin:0 0 24px;color:#6b7280;font-size:13px;">${sessionDate}${location ? ` &middot; ${location}` : ''}</p>` : ''}

            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">Hi ${clientName},</p>

            ${description ? `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">${description}</p>` : `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">Please take a moment to complete the form below before your session.</p>`}

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px;">
              <tr>
                <td style="background:#111111;border-radius:8px;text-align:center;">
                  <a href="${formUrl}" style="display:block;padding:16px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Complete Form</a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
              Or copy this link: <a href="${formUrl}" style="color:#6366f1;text-decoration:none;">${formUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">${senderName} &nbsp;&middot;&nbsp; Questions? Reply to this email.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
