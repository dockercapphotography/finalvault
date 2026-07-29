import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushToPhotographer } from '../_shared/sendPush.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-questionnaire-push-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Same pattern as send-claim-push: called by a database trigger via
    // pg_net, not by a logged-in user -- no Supabase JWT to verify.
    // Deployed with --no-verify-jwt; this shared secret is the actual
    // gate. Deliberately its own distinctly-named secret (not
    // claim_push_secret) so a leak of one doesn't compromise the other.
    const secret = req.headers.get('X-Questionnaire-Push-Secret')
    if (!secret || secret !== Deno.env.get('QUESTIONNAIRE_PUSH_SECRET')) {
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

    const { data: submission, error: submissionError } = await supabase
      .from('session_submissions')
      .select(`
        id, email, session_id,
        sessions ( name, photographer_id )
      `)
      .eq('id', submissionId)
      .single()

    if (submissionError || !submission) {
      return new Response(JSON.stringify({ error: 'Submission not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const photographerId = submission.sessions?.photographer_id
    if (!photographerId) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const sessionName = submission.sessions?.name
    const { sent, cleaned } = await sendPushToPhotographer(supabase, photographerId, {
      title: 'New questionnaire response',
      body: sessionName ? `${submission.email} · ${sessionName}` : submission.email,
      url: `/sessions/${submission.session_id}`,
    })

    return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-questionnaire-push error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
