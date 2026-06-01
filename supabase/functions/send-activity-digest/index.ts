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

    // Fetch all photographers with their notification prefs and auth email
    const { data: photographers, error: photogErr } = await supabase
      .from('photographers')
      .select(`
        id,
        display_name,
        business_name,
        last_digest_sent_at,
        notification_preferences (
          notify_favorites,
          notify_comments,
          notify_downloads
        )
      `)

    if (photogErr) throw photogErr
    if (!photographers?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let sent = 0
    let skipped = 0

    for (const photographer of photographers) {
      const prefs = Array.isArray(photographer.notification_preferences)
        ? photographer.notification_preferences[0]
        : photographer.notification_preferences

      console.log(`Photographer ${photographer.id}: prefs=${JSON.stringify(prefs)}, last_digest=${photographer.last_digest_sent_at}`)

      // Skip if all notifications disabled
      if (!prefs?.notify_favorites && !prefs?.notify_comments && !prefs?.notify_downloads) {
        console.log(`Skipping ${photographer.id}: all notifications disabled`)
        skipped++
        continue
      }

      // Determine window — since last digest or beginning of time
      const since = photographer.last_digest_sent_at
        ? new Date(photographer.last_digest_sent_at)
        : new Date(0)

      // Build action filter based on prefs
      const allowedActions: string[] = []
      if (prefs?.notify_favorites) allowedActions.push('favorite')
      if (prefs?.notify_comments) allowedActions.push('comment')
      if (prefs?.notify_downloads) allowedActions.push('download_single', 'download_all')

      if (!allowedActions.length) { skipped++; continue }

      // Fetch this photographer's gallery IDs first, then query activity
      const { data: photographerGalleries } = await supabase
        .from('galleries')
        .select('id, title, share_token')
        .eq('photographer_id', photographer.id)

      if (!photographerGalleries?.length) {
        console.log(`Skipping ${photographer.id}: no galleries`)
        skipped++
        continue
      }

      const galleryIds = photographerGalleries.map(g => g.id)
      const galleryMap = new Map(photographerGalleries.map(g => [g.id, g]))

      const { data: activity, error: activityError } = await supabase
        .from('gallery_activity_log')
        .select(`
          id,
          action,
          occurred_at,
          gallery_id,
          gallery_viewers (
            display_name,
            email
          ),
          gallery_images (
            file_name
          )
        `)
        .in('gallery_id', galleryIds)
        .in('action', allowedActions)
        .gt('occurred_at', since.toISOString())
        .order('occurred_at', { ascending: false })

      console.log(`Photographer ${photographer.id}: galleryIds=${JSON.stringify(galleryIds)}, since=${since.toISOString()}, allowedActions=${JSON.stringify(allowedActions)}, activity=${activity?.length ?? 'null'}, error=${JSON.stringify(activityError)}`)

      if (!activity?.length) { skipped++; continue }

      // Get photographer's auth email
      const { data: { user } } = await supabase.auth.admin.getUserById(photographer.id)
      if (!user?.email) { skipped++; continue }

      // Group activity by gallery
      const byGallery = new Map<string, { title: string; shareToken: string; events: typeof activity }>()
      for (const event of activity) {
        const g = galleryMap.get(event.gallery_id)
        if (!g) continue
        if (!byGallery.has(event.gallery_id)) {
          byGallery.set(event.gallery_id, { title: g.title, shareToken: g.share_token, events: [] })
        }
        byGallery.get(event.gallery_id)!.events.push(event)
      }

      const senderName = (photographer as any).business_name || photographer.display_name || 'FinalVault'
      const totalEvents = activity.length
      const galleryCount = byGallery.size

      const html = buildDigestHtml({
        senderName,
        byGallery,
        workerUrl,
        totalEvents,
        galleryCount,
        since,
      })

      const subject = `Activity digest — ${totalEvents} new event${totalEvents !== 1 ? 's' : ''} across ${galleryCount} galler${galleryCount !== 1 ? 'ies' : 'y'}`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `FinalVault <noreply@dockercapphotography.com>`,
          to: [user.email],
          subject,
          html,
        }),
      })

      if (res.ok) {
        await supabase
          .from('photographers')
          .update({ last_digest_sent_at: new Date().toISOString() })
          .eq('id', photographer.id)
        sent++
      } else {
        const err = await res.json()
        console.error(`Failed to send digest to ${user.email}:`, err)
        skipped++
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

const BASE_URL = 'https://finalvault.dockercapphotography.com/brand-icons'
const ACTION_ICONS: Record<string, { img: string; label: string }> = {
  favorite:        { label: 'Favorited an image',     img: `${BASE_URL}/digest-favorite.png` },
  comment:         { label: 'Left a comment',         img: `${BASE_URL}/digest-comment.png` },
  download_single: { label: 'Downloaded an image',    img: `${BASE_URL}/digest-download.png` },
  download_all:    { label: 'Downloaded full gallery', img: `${BASE_URL}/digest-download.png` },
}

function buildDigestHtml({ senderName, byGallery, totalEvents, galleryCount, since }: {
  senderName: string
  byGallery: Map<string, { title: string; shareToken: string; events: any[] }>
  workerUrl: string
  totalEvents: number
  galleryCount: number
  since: Date
}) {
  const appUrl = 'https://finalvault.dockercapphotography.com'

  const sinceStr = since.getTime() === 0
    ? 'all time'
    : since.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const gallerySections = [...byGallery.entries()].map(([galleryId, { title, shareToken, events }]) => {
    const galleryUrl = `${appUrl}/galleries/${galleryId}`

    const eventRows = events.slice(0, 20).map(event => {
      const viewer = event.gallery_viewers
      const viewerName = viewer?.display_name || viewer?.email || 'Unknown client'
      const actionMeta = ACTION_ICONS[event.action]
      const label = actionMeta?.label || event.action
      const time = new Date(event.occurred_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
      const imageName = event.gallery_images?.file_name
        ? `<span style="color:#6b7280;font-size:12px;"> — ${event.gallery_images.file_name}</span>`
        : ''
      const iconHtml = actionMeta
        ? `<img src="${actionMeta.img}" width="20" height="20" style="display:inline-block;vertical-align:middle;margin-right:6px;border-radius:4px;" />`
        : ''
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0;color:#111111;font-size:14px;">${iconHtml}${label}${imageName}</p>
            <p style="margin:2px 0 0;color:#6b7280;font-size:12px;padding-left:24px;">${viewerName} &middot; ${time}</p>
          </td>
        </tr>`
    }).join('')

    const moreCount = events.length - 20
    const moreRow = moreCount > 0
      ? `<tr><td style="padding:8px 0;"><p style="margin:0;color:#6b7280;font-size:12px;">+ ${moreCount} more event${moreCount !== 1 ? 's' : ''}</p></td></tr>`
      : ''

    return `
      <tr>
        <td style="padding:0 0 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:14px 20px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;">
                <a href="${galleryUrl}" style="color:#111111;font-size:14px;font-weight:700;text-decoration:none;">${title}</a>
                <span style="color:#9ca3af;font-size:12px;margin-left:8px;">${events.length} event${events.length !== 1 ? 's' : ''}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${eventRows}
                  ${moreRow}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activity Digest</title>
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

        <!-- Summary -->
        <tr>
          <td style="padding:32px 40px 24px;">
            <p style="margin:0 0 6px;color:#111111;font-size:20px;font-weight:700;">Activity Digest</p>
            <p style="margin:0;color:#6b7280;font-size:13px;">
              ${totalEvents} new event${totalEvents !== 1 ? 's' : ''} across ${galleryCount} galler${galleryCount !== 1 ? 'ies' : 'y'} since ${sinceStr}
            </p>
          </td>
        </tr>

        <!-- Gallery sections -->
        <tr>
          <td style="padding:0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${gallerySections}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;">${senderName} &nbsp;&middot;&nbsp; <a href="${appUrl}" style="color:#9ca3af;text-decoration:none;">Open FinalVault</a></p>
            <p style="margin:0;color:#9ca3af;font-size:11px;">You can manage notification preferences in your account settings.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
