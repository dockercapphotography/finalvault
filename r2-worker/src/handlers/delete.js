import { verifyJWT } from '../middleware/auth.js'

/**
 * DELETE /delete/:key
 * Photographer deletes an image — removes both original and preview from R2.
 * Only the owning photographer can delete their files.
 */
export async function handleDelete(request, env, corsHeaders) {
  const auth = await verifyJWT(request)
  if (!auth.valid) {
    return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
  }

  const url = new URL(request.url)
  const key = decodeURIComponent(url.pathname.replace(/^\/delete\//, ''))

  if (!key) {
    return jsonResponse({ ok: false, error: 'No key provided' }, 400, corsHeaders)
  }

  // Security: ensure the key belongs to this photographer
  if (!key.startsWith(`photographers/${auth.userId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied' }, 403, corsHeaders)
  }

  // Derive both keys — original and preview — and delete both
  // Original: .../original/{imageId}.{ext}
  // Preview:  .../preview/{imageId}.webp
  const isOriginal = key.includes('/original/')
  const isPreview = key.includes('/preview/')

  let originalKey, previewKey

  if (isOriginal) {
    originalKey = key
    previewKey = key.replace('/original/', '/preview/').replace(/\.[^.]+$/, '.webp')
  } else if (isPreview) {
    previewKey = key
    // We don't know the original extension, so just delete the preview
    originalKey = null
  } else {
    // Unknown key pattern — delete as-is
    originalKey = key
    previewKey = null
  }

  let originalSize = 0

  try {
    // Get file size before deleting for storage reclamation
    if (originalKey) {
      try {
        const head = await env.BUCKET.head(originalKey)
        if (head) originalSize = head.size || 0
      } catch { /* non-fatal */ }

      await env.BUCKET.delete(originalKey)
    }

    if (previewKey) {
      await env.BUCKET.delete(previewKey).catch(() => {
        // Preview may not exist yet if generation failed — non-fatal
      })
    }

    // Update storage usage
    if (originalSize > 0) {
      try {
        await decrementStorageUsage(env, auth.userId, originalSize)
      } catch (err) {
        console.error('Failed to update storage usage after delete:', err)
      }
    }

    return jsonResponse({ ok: true, originalKey, previewKey, reclaimedBytes: originalSize }, 200, corsHeaders)
  } catch (err) {
    console.error('R2 delete error:', err)
    return jsonResponse({ ok: false, error: 'Delete failed: ' + err.message }, 500, corsHeaders)
  }
}

async function decrementStorageUsage(env, photographerId, fileSize) {
  const url = `${env.SUPABASE_URL}/rest/v1/photographer_storage?photographer_id=eq.${photographerId}`
  const resp = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  })
  const rows = await resp.json()
  if (!rows || rows.length === 0) return

  const current = rows[0].bytes_used || 0
  const updated = Math.max(0, current - fileSize)

  await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bytes_used: updated, updated_at: new Date().toISOString() })
  })
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
