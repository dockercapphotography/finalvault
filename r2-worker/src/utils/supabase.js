/**
 * Small helpers for calling Supabase from the worker with the service key.
 * Used by the v1.7.0 routes (shot lists, Pose Library, AI tags); older
 * handlers keep their own inline fetches.
 */

function headers(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

// Call a database function. Returns { ok, data, error }. error is the
// database's own message (e.g. "Upload limit reached") when the function
// raised an exception.
export async function rpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, data: null, error: body?.message || `Database error (${res.status})` }
  }
  return { ok: true, data: body, error: null }
}

// Plain table access through PostgREST. path is everything after /rest/v1/.
export async function rest(env, path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: headers(env, prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, data: null, error: data?.message || `Database error (${res.status})` }
  }
  return { ok: true, data, error: null }
}

export function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SHARE_TOKEN_RE = /^[a-f0-9]{32}$/
