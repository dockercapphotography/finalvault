import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The fixed hostname every photographer CNAMEs their custom domain to.
// Set up as the Cloudflare for SaaS Fallback Origin (docs/custom-domains-spec.md
// section 5.1 resolution) — never changes per-photographer.
const CNAME_TARGET = 'customers.final-vault.app'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

// Cloudflare's hostname-activation and SSL-status enums are much wider than
// what photographer_domains.status needs to track (see migration 024's CHECK
// constraint). These map the wide Cloudflare vocabulary down to our three
// values; anything not explicitly active or a known failure mode counts as
// still pending.
const CF_ACTIVE_HOSTNAME_STATUSES = ['active', 'active_redeploying']
const CF_ACTIVE_SSL_STATUSES = ['active']
const CF_ERROR_STATUS_SUBSTRINGS = ['timed_out', 'deleted', 'blocked', 'failed']

function deriveStatus(cfHostnameStatus: string | undefined, cfSslStatus: string | undefined): 'pending' | 'active' | 'error' {
  const hostnameOk = cfHostnameStatus ? CF_ACTIVE_HOSTNAME_STATUSES.includes(cfHostnameStatus) : false
  const sslOk = cfSslStatus ? CF_ACTIVE_SSL_STATUSES.includes(cfSslStatus) : false
  if (hostnameOk && sslOk) return 'active'

  const combined = `${cfHostnameStatus ?? ''} ${cfSslStatus ?? ''}`
  if (CF_ERROR_STATUS_SUBSTRINGS.some(s => combined.includes(s))) return 'error'

  return 'pending'
}

function cfHeaders() {
  return {
    'Authorization': `Bearer ${Deno.env.get('CLOUDFLARE_API_TOKEN')!}`,
    'Content-Type': 'application/json',
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// A domain photographers CNAME to us must be a subdomain (v1 scope excludes
// apex/root domains per spec section 4) — require at least 3 labels so
// "example.com" is rejected while "book.example.com" passes. Cloudflare
// itself will reject genuinely malformed hostnames; this is just a fast,
// friendly first check before we spend an API call on it.
function isValidSubdomain(domain: string): boolean {
  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i
  if (!pattern.test(domain)) return false
  return domain.split('.').length >= 3
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Authenticate the photographer
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const zoneId = Deno.env.get('CLOUDFLARE_ZONE_ID')!

  try {
    if (req.method === 'POST') {
      return await handleCreate(supabase, user.id, req, zoneId)
    }
    if (req.method === 'GET') {
      return await handleStatus(supabase, user.id, zoneId)
    }
    if (req.method === 'DELETE') {
      return await handleDelete(supabase, user.id, zoneId)
    }
    return jsonResponse({ error: 'Method not allowed' }, 405)
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

async function handleCreate(supabase: any, photographerId: string, req: Request, zoneId: string) {
  const { domain } = await req.json()
  if (!domain || typeof domain !== 'string') {
    return jsonResponse({ error: 'Missing domain' }, 400)
  }
  const normalizedDomain = domain.trim().toLowerCase()
  if (!isValidSubdomain(normalizedDomain)) {
    return jsonResponse({ error: 'Enter a subdomain of your own domain (e.g. book.yourstudio.com), not a bare domain.' }, 400)
  }

  // One domain per photographer (spec section 3.2 / non-goals)
  const { data: existing } = await supabase
    .from('photographer_domains')
    .select('id')
    .eq('photographer_id', photographerId)
    .maybeSingle()
  if (existing) {
    return jsonResponse({ error: 'A custom domain is already configured. Remove it before adding a new one.' }, 409)
  }

  const cfRes = await fetch(`${CF_API_BASE}/zones/${zoneId}/custom_hostnames`, {
    method: 'POST',
    headers: cfHeaders(),
    body: JSON.stringify({
      hostname: normalizedDomain,
      ssl: { method: 'http', type: 'dv', settings: { http2: 'on' } },
    }),
  })
  const cfData = await cfRes.json()

  if (!cfRes.ok || !cfData.success) {
    console.error('Cloudflare create custom hostname error:', cfData)
    // Cloudflare returns 409-style errors (code 1406) when the hostname is
    // already claimed by another zone/customer on the account.
    const message = cfData?.errors?.[0]?.message || 'Failed to create custom hostname'
    return jsonResponse({ error: message, detail: cfData }, 502)
  }

  const result = cfData.result
  const status = deriveStatus(result.status, result.ssl?.status)
  const verificationErrors = [
    ...(result.verification_errors ?? []),
    ...(result.ssl?.validation_errors?.map((e: any) => e.message) ?? []),
  ]

  const { data: row, error: insertError } = await supabase
    .from('photographer_domains')
    .insert({
      photographer_id: photographerId,
      domain: normalizedDomain,
      cloudflare_hostname_id: result.id,
      status,
      ssl_status: result.ssl?.status ?? null,
      verification_errors: verificationErrors.length ? verificationErrors : null,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Insert error after Cloudflare create succeeded:', insertError)
    // Clean up the orphaned Cloudflare hostname rather than leaving it
    // dangling with no corresponding row.
    await fetch(`${CF_API_BASE}/zones/${zoneId}/custom_hostnames/${result.id}`, {
      method: 'DELETE', headers: cfHeaders(),
    }).catch(e => console.error('Cleanup delete also failed:', e))
    return jsonResponse({ error: 'Failed to save domain' }, 500)
  }

  return jsonResponse({
    domain: row.domain,
    cname_target: CNAME_TARGET,
    status: row.status,
    ssl_status: row.ssl_status,
    verification_errors: row.verification_errors,
  })
}

async function handleStatus(supabase: any, photographerId: string, zoneId: string) {
  const { data: row, error } = await supabase
    .from('photographer_domains')
    .select('*')
    .eq('photographer_id', photographerId)
    .maybeSingle()

  if (error) {
    console.error(error)
    return jsonResponse({ error: 'Failed to load domain' }, 500)
  }
  if (!row) {
    return jsonResponse({ error: 'No custom domain configured' }, 404)
  }

  const cfRes = await fetch(`${CF_API_BASE}/zones/${zoneId}/custom_hostnames/${row.cloudflare_hostname_id}`, {
    headers: cfHeaders(),
  })
  const cfData = await cfRes.json()

  if (!cfRes.ok || !cfData.success) {
    console.error('Cloudflare status check error:', cfData)
    // Don't fail the whole request if Cloudflare is briefly unreachable —
    // return what we already have in the DB rather than an error.
    return jsonResponse({
      domain: row.domain,
      cname_target: CNAME_TARGET,
      status: row.status,
      ssl_status: row.ssl_status,
      verification_errors: row.verification_errors,
      stale: true,
    })
  }

  const result = cfData.result
  const status = deriveStatus(result.status, result.ssl?.status)
  const verificationErrors = [
    ...(result.verification_errors ?? []),
    ...(result.ssl?.validation_errors?.map((e: any) => e.message) ?? []),
  ]

  const { data: updated, error: updateError } = await supabase
    .from('photographer_domains')
    .update({
      status,
      ssl_status: result.ssl?.status ?? null,
      verification_errors: verificationErrors.length ? verificationErrors : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select()
    .single()

  if (updateError) {
    console.error(updateError)
    return jsonResponse({ error: 'Failed to update domain status' }, 500)
  }

  return jsonResponse({
    domain: updated.domain,
    cname_target: CNAME_TARGET,
    status: updated.status,
    ssl_status: updated.ssl_status,
    verification_errors: updated.verification_errors,
  })
}

async function handleDelete(supabase: any, photographerId: string, zoneId: string) {
  const { data: row, error } = await supabase
    .from('photographer_domains')
    .select('*')
    .eq('photographer_id', photographerId)
    .maybeSingle()

  if (error) {
    console.error(error)
    return jsonResponse({ error: 'Failed to load domain' }, 500)
  }
  if (!row) {
    return jsonResponse({ error: 'No custom domain configured' }, 404)
  }

  const cfRes = await fetch(`${CF_API_BASE}/zones/${zoneId}/custom_hostnames/${row.cloudflare_hostname_id}`, {
    method: 'DELETE', headers: cfHeaders(),
  })

  // Cloudflare returns success:false with a "hostname not found" style error
  // if it was already removed on their side (e.g. manually, in the
  // dashboard) — treat that as success rather than blocking the local
  // cleanup, since the end state we want (no hostname, no row) is the same.
  if (!cfRes.ok) {
    const cfData = await cfRes.json().catch(() => null)
    console.error('Cloudflare delete custom hostname error:', cfData)
    if (cfRes.status !== 404) {
      return jsonResponse({ error: 'Failed to remove domain from Cloudflare', detail: cfData }, 502)
    }
  }

  const { error: deleteError } = await supabase
    .from('photographer_domains')
    .delete()
    .eq('id', row.id)

  if (deleteError) {
    console.error(deleteError)
    return jsonResponse({ error: 'Failed to remove domain' }, 500)
  }

  return jsonResponse({ ok: true })
}
