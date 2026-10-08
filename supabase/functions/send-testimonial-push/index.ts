import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToPhotographer } from '../_shared/sendPush.ts'

// v1.5.17: push when a client sends a review. Mirrors send-inquiry-push.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-testimonial-push-secret',
}

// Long reviews get cut on a word boundary so the notification stays
// readable on a lock screen.
function excerpt(text: string, max = 90) {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Called by submit_testimonial via pg_net, not by a logged-in user --
    // no Supabase JWT to verify. Deployed with --no-verify-jwt; this shared
    // secret is the actual gate. Same pattern as send-inquiry-push.
    const secret = req.headers.get('X-Testimonial-Push-Secret')
    if (!secret || secret !== Deno.env.get('TESTIMONIAL_PUSH_SECRET')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { submissionId } = await req.json()
    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'Missing submissionId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: submission, error: subError } = await supabase
      .from('testimonial_submissions')
      .select(`
        id, photographer_id, quote, name,
        testimonial_requests ( session_id, clients ( first_name, last_name ) )
      `)
      .eq('id', submissionId)
      .single()

    if (subError || !submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const client = submission.testimonial_requests?.clients
    const clientName = client
      ? `${client.first_name || ''} ${client.last_name || ''}`.trim() || submission.name
      : submission.name

    const { sent, cleaned } = await sendPushToPhotographer(supabase, submission.photographer_id, {
      title: 'New review!',
      body: `${clientName}: “${excerpt(submission.quote)}”`,
      // Straight to the session's Review card, where it can be approved.
      url: submission.testimonial_requests?.session_id
        ? `/sessions/${submission.testimonial_requests.session_id}#review`
        : '/website#testimonials',
    })

    return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-testimonial-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
