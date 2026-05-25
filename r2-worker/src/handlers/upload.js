import { verifyJWT } from '../middleware/auth.js'

/**
 * POST /upload
 * Photographer uploads an image to R2.
 * Stores the original file under:
 *   photographers/{photographerId}/galleries/{galleryId}/original/{uuid}.{ext}
 *
 * The preview (watermarked WebP) is generated separately by a
 * Supabase Edge Function triggered after this upload completes.
 */
export async function handleUpload(request, env, corsHeaders) {
  // Verify photographer JWT
  const auth = await verifyJWT(request)
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
  const galleryId = formData.get('galleryId')
  const imageId = formData.get('imageId') // UUID generated client-side

  if (!file || !galleryId || !imageId) {
    return jsonResponse({ ok: false, error: 'Missing required fields: file, galleryId, imageId' }, 400, corsHeaders)
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/tiff', 'image/heic', 'image/heif',
    'image/x-canon-cr2', 'image/x-canon-cr3',
    'image/x-nikon-nef', 'image/x-sony-arw',
    'image/x-adobe-dng', 'image/x-fuji-raf',
  ]

  // Check MIME type — also allow generic octet-stream for RAW files
  const fileType = file.type || 'application/octet-stream'
  const ext = file.name?.split('.').pop()?.toLowerCase() || ''
  const rawExtensions = ['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw']
  const isRaw = rawExtensions.includes(ext)
  const isAllowed = allowedTypes.includes(fileType) || isRaw || fileType === 'application/octet-stream'

  if (!isAllowed) {
    return jsonResponse({ ok: false, error: `Unsupported file type: ${fileType}` }, 400, corsHeaders)
  }

  // Build R2 key — verify photographer owns this gallery via key prefix
  const originalKey = `photographers/${auth.userId}/galleries/${galleryId}/original/${imageId}.${ext}`

  try {
    // Store original file in R2 — no processing, no compression
    await env.BUCKET.put(originalKey, file.stream(), {
      httpMetadata: {
        contentType: fileType,
        cacheControl: 'private, no-cache', // originals are private
      },
      customMetadata: {
        photographerId: auth.userId,
        galleryId,
        imageId,
        originalName: file.name || '',
        uploadedAt: new Date().toISOString(),
      }
    })

    // Update storage usage in Supabase
    try {
      await updateStorageUsage(env, auth.userId, file.size)
    } catch (storageErr) {
      // Non-fatal — upload succeeded, storage count is best-effort
      console.error('Failed to update storage usage:', storageErr)
    }

    return jsonResponse({
      ok: true,
      originalKey,
      imageId,
      fileSize: file.size,
      fileType,
    }, 200, corsHeaders)

  } catch (err) {
    console.error('R2 upload error:', err)
    return jsonResponse({ ok: false, error: 'Upload failed: ' + err.message }, 500, corsHeaders)
  }
}

async function updateStorageUsage(env, photographerId, fileSize) {
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
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
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
