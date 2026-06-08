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

    const { token, signedName } = await req.json()

    if (!token || !signedName?.trim()) {
      return new Response(JSON.stringify({ error: 'Missing token or signedName' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Load contract by sign_token
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, title, status, photographer_id, clients(first_name, last_name, email), photographers(display_name, business_name)')
      .eq('sign_token', token)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!['sent'].includes(contract.status)) {
      return new Response(JSON.stringify({ error: 'Contract is not awaiting signature' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Capture IP from request headers (Cloudflare / Deno Deploy provide CF-Connecting-IP)
    const signedIp =
      req.headers.get('CF-Connecting-IP') ||
      req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      req.headers.get('X-Real-IP') ||
      'unknown'

    const signedUserAgent = req.headers.get('User-Agent') || 'unknown'
    const now = new Date().toISOString()

    // Record the client signature
    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'pending_photographer',
        signed_at: now,
        signed_name: signedName.trim(),
        signed_ip: signedIp,
        signed_user_agent: signedUserAgent,
        updated_at: now,
      })
      .eq('id', contract.id)

    if (updateError) throw updateError

    // Notify photographer via email
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const senderName = contract.photographers?.business_name || contract.photographers?.display_name || 'FinalVault'
    const clientName = contract.clients ? `${contract.clients.first_name} ${contract.clients.last_name}` : 'Your client'
    const appUrl = 'https://finalvault.dockercapphotography.com'

    // Get photographer email
    const { data: { user: photographer } } = await supabase.auth.admin.getUserById(contract.photographer_id)
    const photographerEmail = photographer?.email

    if (photographerEmail) {
      const contractUrl = `${appUrl}/contracts/${contract.id}`
      const html = buildPhotographerNotificationHtml({
        senderName,
        clientName,
        contractTitle: contract.title,
        signedName: signedName.trim(),
        signedAt: new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        contractUrl,
      })

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `FinalVault <noreply@dockercapphotography.com>`,
          to: [photographerEmail],
          subject: `${clientName} signed "${contract.title}" — your counter-signature is needed`,
          html,
        }),
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildPhotographerNotificationHtml({ senderName, clientName, contractTitle, signedName, signedAt, contractUrl }: {
  senderName: string
  clientName: string
  contractTitle: string
  signedName: string
  signedAt: string
  contractUrl: string
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;">
        <tr>
          <td style="background:#111111;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">FinalVault</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 32px;">
            <p style="margin:0 0 16px;color:#111111;font-size:20px;font-weight:700;">Contract signed — action needed</p>
            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
              <strong>${clientName}</strong> has signed <strong>${contractTitle}</strong>.
              Your counter-signature is needed to complete this contract.
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Signature details</p>
              <p style="margin:0 0 4px;color:#111;font-size:14px;"><strong>Signed by:</strong> ${signedName}</p>
              <p style="margin:0;color:#111;font-size:14px;"><strong>Date:</strong> ${signedAt}</p>
            </div>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#6366f1;border-radius:10px;">
                  <a href="${contractUrl}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                    Review &amp; Counter-Sign →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#9ca3af;font-size:13px;">
              You can also find this contract in FinalVault under the client's record.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">Sent via FinalVault</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
