import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToPhotographer } from '../_shared/sendPush.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-inquiry-push-secret',
}

function formatClock(hourStr: string, minStr: string) {
  const hour = parseInt(hourStr, 10)
  const displayHour = hour % 12 || 12
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${displayHour}:${minStr} ${period}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Called by submit_signup_inquiry via pg_net, not by a logged-in user --
    // no Supabase JWT to verify. Deployed with --no-verify-jwt; this shared
    // secret is the actual gate. Same pattern as send-claim-push.
    const secret = req.headers.get('X-Inquiry-Push-Secret')
    if (!secret || secret !== Deno.env.get('INQUIRY_PUSH_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { sessionId } = await req.json()
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        id, photographer_id, type, session_date, start_time, end_time,
        clients ( first_name, last_name )
      `)
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clientName = session.clients
      ? `${session.clients.first_name} ${session.clients.last_name}`.trim()
      : 'A client'

    // The requested time is not yet confirmed at this point (that's the
    // whole point of inquiry mode) -- but showing it here still gives the
    // photographer enough to act on without opening the app.
    let timeLabel = ''
    if (session.session_date && session.start_time) {
      const dateLabel = new Date(`${session.session_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const [sh, sm] = session.start_time.split(':')
      const startLabel = formatClock(sh, sm)
      if (session.end_time) {
        const [eh, em] = session.end_time.split(':')
        timeLabel = ` — ${dateLabel}, ${startLabel}–${formatClock(eh, em)}`
      } else {
        timeLabel = ` — ${dateLabel}, ${startLabel}`
      }
    }

    const { sent, cleaned } = await sendPushToPhotographer(supabase, session.photographer_id, {
      title: 'New inquiry!',
      body: `${clientName} requested ${session.type}${timeLabel}`,
      url: `/sessions/${session.id}`,
    })

    return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-inquiry-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
