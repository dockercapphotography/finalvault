// supabase/functions/send-zip-ready-email/index.ts
//
// Sends the "your download is ready" email when a Tier 3 ZIP job
// finishes successfully. Called by the ZipQueueWorkflow (Cloudflare
// Worker), not by a logged-in user -- there's no Supabase JWT to verify.
// Deployed with --no-verify-jwt; the shared secret below is the actual
// gate, same pattern as send-claim-push.
//
// The download link points at a frontend route (/download/:jobId), not
// directly at the r2-worker -- matches the existing pattern everywhere
// else in this app (e.g. send-contract's signUrl is a frontend route,
// not a direct link to the r2-worker's contract-pdf endpoint). That
// frontend route doesn't exist yet as of this commit -- it's part of
// the still-to-come frontend build step (spec section 8, step 7) and
// the GET /zip-jobs/:id/download Worker endpoint (step 5). Until both
// land, this link will 404 -- expected at this stage, not a bug here.

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
        id, notify_email, image_count, images_completed, skipped_images,
        galleries ( title, photographer_id )
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

    const downloadUrl = `${await getPublicBaseUrl(supabase, photographerId)}/download/${job.id}`

    const skippedCount = Array.isArray(job.skipped_images) ? job.skipped_images.length : 0
    const includedCount = job.image_count - skippedCount

    const html = buildEmailHtml({
      senderName,
      logoUrl,
      galleryTitle,
      downloadUrl,
      includedCount,
      totalCount: job.image_count,
      skippedCount,
    })

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
        subject: `Your download is ready — ${galleryTitle}`,
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

function buildEmailHtml({ senderName, logoUrl, galleryTitle, downloadUrl, includedCount, totalCount, skippedCount }: {
  senderName: string
  logoUrl: string | null
  galleryTitle: string
  downloadUrl: string
  includedCount: number
  totalCount: number
  skippedCount: number
}) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your download is ready</title>
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
            <p style="margin:0 0 6px;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">Your download is ready</p>
            <p style="margin:0;color:#6b7280;font-size:13px;">${galleryTitle}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 40px;">
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Your ZIP of ${includedCount} full-resolution photo${includedCount === 1 ? '' : 's'} is ready to download.
              ${skippedCount > 0
                ? `<br><br><strong>${skippedCount} photo${skippedCount === 1 ? '' : 's'} could not be included</strong> after repeated attempts to retrieve ${skippedCount === 1 ? 'it' : 'them'} -- everything else downloaded successfully.`
                : ''
              }
            </p>

            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
              <tr>
                <td style="background:#111111;border-radius:8px;text-align:center;">
                  <a href="${downloadUrl}" style="display:block;padding:16px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Download ZIP</a>
                </td>
              </tr>
            </table>
            <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;text-align:center;">This link expires in 7 days.</p>
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
