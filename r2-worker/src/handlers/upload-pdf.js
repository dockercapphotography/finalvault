/**
 * POST /upload-pdf
 * Internal endpoint for uploading generated contract PDFs from Supabase Edge Functions.
 * Auth: Supabase service role key in Authorization header (not a user JWT).
 *
 * Form fields:
 *   file  - The PDF file
 *   key   - R2 key, must match photographers/{id}/contracts/{id}.pdf
 */

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function handlePdfUpload(request, env, corsHeaders) {
  // Validate using the Supabase service role key stored as a worker secret
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()

  if (!token || token !== env.SUPABASE_SERVICE_KEY) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401, corsHeaders)
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid form data' }, 400, corsHeaders)
  }

  const file = formData.get('file')
  const key = formData.get('key')

  if (!file || !key) {
    return jsonResponse({ ok: false, error: 'Missing required fields: file, key' }, 400, corsHeaders)
  }

  // Key must be a contract PDF path
  if (!key.match(/^photographers\/[0-9a-f-]+\/contracts\/[0-9a-f-]+\.pdf$/)) {
    return jsonResponse({ ok: false, error: 'Invalid key: must be photographers/{id}/contracts/{id}.pdf' }, 403, corsHeaders)
  }

  try {
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, no-cache',
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        type: 'contract-pdf',
      },
    })

    return jsonResponse({ ok: true, key }, 200, corsHeaders)
  } catch (err) {
    console.error('R2 PDF upload error:', err)
    return jsonResponse({ ok: false, error: 'Upload failed: ' + err.message }, 500, corsHeaders)
  }
}
