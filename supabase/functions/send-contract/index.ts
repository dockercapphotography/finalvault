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

    // Authenticate the photographer
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
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

    // Load the contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, clients(*)')
      .eq('id', contractId)
      .eq('photographer_id', user.id)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!contract.clients?.email) {
      return new Response(JSON.stringify({ error: 'Client has no email address' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Load photographer info
    const { data: photographer } = await supabase
      .from('photographers')
      .select('display_name, business_name')
      .eq('id', user.id)
      .single()

    const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'
    const clientName = `${contract.clients.first_name} ${contract.clients.last_name}`
    const appUrl = 'https://finalvault.dockercapphotography.com'
    const signUrl = `${appUrl}/sign/${contract.sign_token}`

    // Build the email HTML
    const html = buildContractEmailHtml({
      senderName,
      clientName: contract.clients.first_name,
      contractTitle: contract.title,
      signUrl,
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
        to: [contract.clients.email],
        subject: `Please sign: ${contract.title}`,
        html,
      }),
    })

    const resData = await res.json()
    if (!res.ok) {
      console.error('Resend error:', resData)
      return new Response(JSON.stringify({ error: 'Email send failed', detail: resData }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Update contract status to 'sent'
    await supabase
      .from('contracts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId)

    return new Response(JSON.stringify({ ok: true, emailId: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildContractEmailHtml({ senderName, clientName, contractTitle, signUrl }: {
  senderName: string
  clientName: string
  contractTitle: string
  signUrl: string
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${contractTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:28px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 16px;color:#111111;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
              Please review and sign
            </p>
            <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
              Hi ${clientName},
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              ${senderName} has sent you a contract to review and sign:
            </p>

            <!-- Contract title box -->
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
              <p style="margin:0;color:#6366f1;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Contract</p>
              <p style="margin:4px 0 0;color:#111111;font-size:16px;font-weight:600;">${contractTitle}</p>
            </div>

            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
              Please click the button below to read the full contract and add your electronic signature. Your signature is legally binding under US ESIGN/UETA.
            </p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#6366f1;border-radius:10px;">
                  <a href="${signUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.1px;">
                    Review &amp; Sign Contract →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 6px;color:#6b7280;font-size:13px;line-height:1.5;">
              Or copy this link into your browser:
            </p>
            <p style="margin:0;color:#6366f1;font-size:12px;word-break:break-all;">
              ${signUrl}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              Sent via FinalVault · If you didn't expect this, you can ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
