// supabase/functions/send-zip-failed-email/index.ts
//
// Sends the "we ran into a problem preparing your download" email when a
// Tier 3 ZIP job fails outright (as opposed to individual skipped images
// within an otherwise-successful job -- that case uses send-zip-ready-email
// instead, since the job still completes).
//
// Called by the ZipQueueWorkflow, not a logged-in user -- deployed with
// --no-verify-jwt, gated by the same shared secret as send-zip-ready-email.
//
// The retry link goes to wherever the person can re-click "Download All
// (Hi-Res)": the client gallery page (/g/:token) for client-initiated
// jobs, or the photographer's own gallery detail page (/galleries/:id)
// for photographer-initiated jobs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zip-job-email-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = req.headers.get('X-Zip-Job-Email-Secret')
    if (!secret || secret !== Deno.env.get('ZIP_JOB_EMAIL_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { jobId } = await req.json()
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'Missing jobId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: job, error: jobError } = await supabase
      .from('zip_jobs')
      .select(`
        id, notify_email, requested_by_photographer_id, size,
        galleries ( id, title, photographer_id, share_token )
      `)
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const photographerId = job.galleries?.photographer_id
    const galleryTitle = job.galleries?.title || 'your gallery'

    const { data: photographer } = await supabase
      .from('photographers')
      .select('display_name, business_name, logo_r2_key')
      .eq('id', photographerId)
      .single()

    const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'
    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    const logoUrl = photographer?.logo_r2_key
      ? `${workerUrl}/logo/${encodeURIComponent(photographer.logo_r2_key)}`
      : null

    const appUrl = await getPublicBaseUrl(supabase, photographerId)
    const retryUrl = job.requested_by_photographer_id
      ? `${appUrl}/galleries/${job.galleries?.id}`
      : `${appUrl}/g/${job.galleries?.share_token}`

    const html = buildEmailHtml({ senderName, logoUrl, galleryTitle, retryUrl })

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@mail.final-vault.app>`,
        to: [job.notify_email],
        subject: `We ran into a problem preparing your ${job.size === 'web' ? 'web-size' : 'hi-res'} download — ${galleryTitle}`,
        html,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      console.error('Resend send failed:', data)
      return new Response(JSON.stringify({ ok: false, error: data?.message || 'Send failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function buildEmailHtml({ senderName, logoUrl, galleryTitle, retryUrl }: {
  senderName: string
  logoUrl: string | null
  galleryTitle: string
  retryUrl: string
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download problem</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <tr>
          <td style="background:#111111;padding:24px 40px;text-align:center;">
            ${logoUrl
              ? `<img src="${logoUrl}" alt="${senderName}" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />`
              : `<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>`
            }
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px 0;text-align:center;">
            <p style="margin:0 0 6px;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">We ran into a problem</p>
            <p style="margin:0;color:#6b7280;font-size:13px;">${galleryTitle}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 40px;">
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              We weren't able to finish preparing your download. This is usually temporary --
              please try again, and reach out if it keeps happening.
            </p>

            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
              <tr>
                <td style="background:#111111;border-radius:8px;text-align:center;">
                  <a href="${retryUrl}" style="display:block;padding:16px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Try Again</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

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
