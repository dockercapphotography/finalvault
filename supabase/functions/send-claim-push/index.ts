import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-claim-push-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // This function is called by a database trigger via pg_net, not by a
    // logged-in user -- there's no Supabase JWT to verify. Deployed with
    // --no-verify-jwt; this shared secret is the actual gate.
    const secret = req.headers.get('X-Claim-Push-Secret')
    if (!secret || secret !== Deno.env.get('CLAIM_PUSH_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { slotId } = await req.json()
    if (!slotId) {
      return new Response(JSON.stringify({ error: 'Missing slotId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // signup_slots has no photographer_id directly -- join through
    // signup_pages (confirmed against live schema this session). Also
    // pulls the shoot type name and the page's timezone for formatting
    // the claimed time in the notification body.
    const { data: slot, error: slotError } = await supabase
      .from('signup_slots')
      .select(`
        id, client_name, start_time,
        signup_shoot_types ( name ),
        signup_pages ( photographer_id, timezone, token )
      `)
      .eq('id', slotId)
      .single()

    if (slotError || !slot) {
      return new Response(JSON.stringify({ error: 'Slot not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const photographerId = slot.signup_pages?.photographer_id
    const timezone = slot.signup_pages?.timezone || 'UTC'
    const shootTypeName = slot.signup_shoot_types?.name || 'Session'

    const timeLabel = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(slot.start_time))

    const { data: subscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('photographer_id', photographerId)

    if (subsError) throw subsError
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    const payload = JSON.stringify({
      title: 'New booking!',
      body: `${slot.client_name || 'A client'} booked ${shootTypeName} — ${timeLabel}`,
      url: `/signup/${slot.signup_pages?.token}/status`,
    })

    let sent = 0
    const staleIds: string[] = []

    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err) {
        // 404/410 means the push service has permanently invalidated this
        // subscription (permission revoked, PWA uninstalled, etc.) --
        // clean it up so push_subscriptions doesn't accumulate dead rows.
        const statusCode = err?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id)
        } else {
          console.error('Push send failed:', sub.id, err)
        }
      }
    }))

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds)
    }

    return new Response(JSON.stringify({ ok: true, sent, cleaned: staleIds.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-claim-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
