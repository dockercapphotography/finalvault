import { verifyJWT } from '../middleware/auth.js'
import { rpc } from '../utils/supabase.js'

/**
 * POST /upload
 * Stores a file to R2. Used for both originals and previews.
 *
 * Form fields:
 *   file       - The file to store
 *   key        - The exact R2 key to store it under
 *
 * The client is responsible for:
 *   - Generating the preview (resize + watermark) via Canvas API
 *   - Uploading both original and preview separately
 *   - Writing metadata to Supabase after both uploads succeed
 */
export async function handleUpload(request, env, corsHeaders) {
  const auth = await verifyJWT(request, env)
  if (!auth.valid) {
    return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
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

  // Security: key must belong to this photographer
  if (!key.startsWith(`photographers/${auth.userId}/`)) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid key prefix' }, 403, corsHeaders)
  }

  // Key must follow expected pattern (original or preview)
  // v1.7.0: Pose Library images (1200px WebP made in the browser).
  const isPoseLibrary = key.startsWith(`photographers/${auth.userId}/poses/library/`)
  if (isPoseLibrary) {
    if (!['image/webp', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return jsonResponse({ ok: false, error: 'Pose images must be WebP or JPEG, 5 MB or smaller' }, 400, corsHeaders)
    }
  }

  if (!isPoseLibrary && !key.includes('/original/') && !key.includes('/preview/') && !key.includes('/web/') && !key.includes('/folders/') && !key.includes('/clients/')) {
    return jsonResponse({ ok: false, error: 'Invalid key: must contain /original/ or /preview/' }, 400, corsHeaders)
  }

  const isPreview = key.includes('/preview/')
  const fileType = file.type || 'application/octet-stream'

  try {
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: fileType,
        // Previews use no-cache so re-watermarked images are always revalidated.
        // ETag-based caching still keeps repeat loads fast when content hasn't changed.
        cacheControl: isPreview
          ? 'public, no-cache, must-revalidate'
          : 'private, no-cache',
      },
      customMetadata: {
        photographerId: auth.userId,
        uploadedAt: new Date().toISOString(),
        type: isPreview ? 'preview' : 'original',
      }
    })

    // Update storage usage for originals only (Pose Library: atomic counter)
    if (isPoseLibrary) {
      const inc = await rpc(env, 'increment_photographer_storage', { p_photographer_id: auth.userId, p_delta: file.size })
      if (!inc.ok) console.error('Failed to update storage usage:', inc.error)
    } else if (!isPreview) {
      try {
        await updateStorageUsage(env, auth.userId, file.size)
      } catch (err) {
        console.error('Failed to update storage usage:', err)
      }
    }

    return jsonResponse({ ok: true, key, size: file.size }, 200, corsHeaders)

  } catch (err) {
    console.error('R2 upload error:', err)
    return jsonResponse({ ok: false, error: 'Upload failed: ' + err.message }, 500, corsHeaders)
  }
}

async function updateStorageUsage(env, photographerId, fileSize) {
  const url = `${env.SUPABASE_URL}/rest/v1/photographer_storage?photographer_id=eq.${photographerId}`
  const resp = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  })
  const rows = await resp.json()
  if (!rows?.length) return
  const current = rows[0].bytes_used || 0
  await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bytes_used: current + fileSize, updated_at: new Date().toISOString() })
  })
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
