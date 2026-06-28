/**
 * contract-pdf.js
 *
 * GET /contract-pdf/:contractId?token=<client portal_token>
 *
 * Serves a signed contract's PDF to the client portal. Unlike every other
 * file-serving route in this worker, there's no share_token/gallery concept
 * here -- ownership has to be proven by joining contracts -> clients on the
 * client's portal_token, in one query, so a request can't be satisfied by
 * a contract id that merely exists without also belonging to the client
 * the token resolves to.
 *
 * Deliberately does NOT use verifyShareToken -- that function is built
 * around gallery share tokens and the is_active/expires_at gate, neither
 * of which applies to a client's portal_token or a signed contract.
 */

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function handleContractPdf(request, env, corsHeaders) {
  const url = new URL(request.url)
  const contractId = decodeURIComponent(url.pathname.replace(/^\/contract-pdf\//, ''))
  const token = url.searchParams.get('token')

  if (!contractId || !token) {
    return jsonResponse({ ok: false, error: 'Missing contract id or token' }, 400, corsHeaders)
  }

  try {
    // Single query proving both facts at once: the contract exists AND
    // belongs to the client whose portal_token matches. PostgREST's
    // embedded-resource filter syntax (clients.portal_token=eq...) lets us
    // join and filter in one request rather than two round trips that
    // could be raced or independently satisfied.
    const query =
      `id=eq.${encodeURIComponent(contractId)}` +
      `&status=eq.signed` +
      `&select=id,status,pdf_r2_key,clients!inner(portal_token)` +
      `&clients.portal_token=eq.${encodeURIComponent(token)}`

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/contracts?${query}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })

    if (!resp.ok) {
      return jsonResponse({ ok: false, error: 'Failed to verify contract' }, 500, corsHeaders)
    }

    const rows = await resp.json()
    if (!rows || rows.length === 0) {
      // Deliberately the same error for "contract doesn't exist", "belongs
      // to a different client", and "not yet signed" -- distinguishing
      // them would tell an attacker which guess was closer.
      return jsonResponse({ ok: false, error: 'Contract not found' }, 404, corsHeaders)
    }

    const contract = rows[0]
    if (!contract.pdf_r2_key) {
      return jsonResponse({ ok: false, error: 'PDF not available yet' }, 404, corsHeaders)
    }

    const object = await env.BUCKET.get(contract.pdf_r2_key)
    if (!object) {
      return jsonResponse({ ok: false, error: 'PDF file not found in storage' }, 404, corsHeaders)
    }

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', `attachment; filename="contract-${contractId}.pdf"`)
    headers.set('Cache-Control', 'private, no-cache')

    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    console.error('Contract PDF fetch error:', err)
    return jsonResponse({ ok: false, error: 'Failed to fetch contract PDF' }, 500, corsHeaders)
  }
}
