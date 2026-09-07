import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToPhotographer } from '../_shared/sendPush.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-activity-push-secret',
}

function truncate(text: string, max = 60) {
  const trimmed = text.trim()
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() + '…' : trimmed
}

// Prefers a matching client record's real name over the viewer's own
// display name/email -- clients are the photographer's own labeled
// contacts, so "Jane Doe" beats a bare "jane@example.com" whenever the
// viewer's email matches one on file for this photographer specifically
// (never across photographers -- same scoping submit_signup_inquiry/
// claim_signup_slot already use for their own client lookups).
async function resolveViewerName(
  supabase: ReturnType<typeof createClient>,
  photographerId: string,
  viewerEmail: string | null | undefined,
  viewerDisplayName: string | null | undefined,
) {
  if (viewerEmail) {
    const { data: client } = await supabase
      .from('clients')
      .select('first_name, last_name')
      .eq('photographer_id', photographerId)
      .ilike('email', viewerEmail.trim())
      .maybeSingle()
    if (client) {
      const name = `${client.first_name || ''} ${client.last_name || ''}`.trim()
      if (name) return name
    }
  }
  return viewerDisplayName || viewerEmail || 'A client'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Called by notify_gallery_activity_push (single comments) and
    // flush_activity_batches (batched favorites/downloads) via pg_net,
    // not by a logged-in user -- no Supabase JWT to verify. Deployed
    // with --no-verify-jwt; this shared secret is the actual gate.
    const secret = req.headers.get('X-Activity-Push-Secret')
    if (!secret || secret !== Deno.env.get('ACTIVITY_PUSH_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const payload = await req.json()
    const mode = payload.mode || 'single'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (mode === 'batch') {
      const { galleryId, viewerId, category, count } = payload
      if (!galleryId || !viewerId || !category || !count) {
        return new Response(JSON.stringify({ error: 'Missing batch fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: gallery, error: galleryError } = await supabase
        .from('galleries')
        .select('photographer_id, title')
        .eq('id', galleryId)
        .single()

      if (galleryError || !gallery) {
        return new Response(JSON.stringify({ error: 'Gallery not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: viewer } = await supabase
        .from('gallery_viewers')
        .select('display_name, email')
        .eq('id', viewerId)
        .maybeSingle()

      const viewerName = await resolveViewerName(supabase, gallery.photographer_id, viewer?.email, viewer?.display_name)
      const plural = count === 1 ? '' : 's'
      const verb = category === 'favorite' ? 'favorited' : 'downloaded'
      const body = `${viewerName} ${verb} ${count} image${plural}`

      const { sent, cleaned } = await sendPushToPhotographer(supabase, gallery.photographer_id, {
        title: gallery.title || 'A gallery',
        body,
        url: `/galleries/${galleryId}/activity`,
      })

      return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // mode === 'single' -- comments only now; favorite/download moved
    // entirely to batch mode above.
    const { activityLogId } = payload
    if (!activityLogId) {
      return new Response(JSON.stringify({ error: 'Missing activityLogId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: log, error: logError } = await supabase
      .from('gallery_activity_log')
      .select(`
        id, action, gallery_id, metadata,
        galleries ( photographer_id, title ),
        gallery_viewers ( display_name, email )
      `)
      .eq('id', activityLogId)
      .single()

    if (logError || !log) {
      return new Response(JSON.stringify({ error: 'Activity log entry not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const photographerId = log.galleries?.photographer_id
    const galleryTitle = log.galleries?.title || 'A gallery'
    const viewerName = await resolveViewerName(supabase, photographerId, log.gallery_viewers?.email, log.gallery_viewers?.display_name)

    const commentText = log.metadata?.comment_body
    const body = commentText
      ? `${viewerName}: "${truncate(commentText)}"`
      : `${viewerName} left a comment`

    const { sent, cleaned } = await sendPushToPhotographer(supabase, photographerId, {
      title: galleryTitle,
      body,
      url: `/galleries/${log.gallery_id}/activity`,
    })

    return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-activity-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
