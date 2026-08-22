/**
 * zip-jobs.js — async hi-res ZIP job creation
 *
 * POST /zip-jobs
 * Body: { galleryId, imageKeys, fileNames, notifyEmail, viewerId }
 *   - galleryId:   required only on the photographer (JWT) path; derived
 *                  from the share token on the client path
 *   - imageKeys:   original_r2_key values (same shape as /download-zip)
 *   - fileNames:   display filenames
 *   - notifyEmail: where to send the "your download is ready" email
 *   - viewerId:    gallery_viewers.id, client path only. Optional -- not
 *                  always known at request time (see 026 migration notes),
 *                  so this can be omitted and the job is still created,
 *                  just without an attributable viewer.
 *
 * Hi-res only -- this replaces hi-res calls to /download-zip. The client
 * decides whether to call this endpoint at all: small galleries (under the
 * frontend's sync-fallback threshold, 25 images AND 250MB) should keep
 * calling /download-zip directly instead. This endpoint doesn't re-check
 * that threshold -- queuing a small gallery here isn't a security problem,
 * just a slower path than necessary, so there's no need to duplicate that
 * decision server-side.
 *
 * Validates the same way /download-zip does (JWT or share token, R2 key
 * ownership prefix check), then cross-checks the requested keys against
 * gallery_images (also gives us file sizes for estimated_total_bytes),
 * inserts a zip_jobs row, triggers the ZipQueueWorkflow, and returns
 * { jobId } immediately -- no streaming, no waiting on the actual ZIP build.
 */

import { verifyShareToken } from '../middleware/shareToken.js'
import { verifyJWT } from '../middleware/auth.js'

export async function handleZipJobs(request, env, corsHeaders) {
  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const hasShareToken = !!request.headers.get('X-Share-Token')

  let photographerId
  let galleryId
  let viewerId = null
  let isClientRequest = false
  let imageKeys = []
  let fileNames = []
  let notifyEmail = null

  if (hasJWT) {
    const auth = await verifyJWT(request)
    if (!auth.valid) {
      return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    }
    photographerId = auth.userId

    let body
    try { body = await request.json() } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders)
    }
    galleryId = body.galleryId
    imageKeys = body.imageKeys || []
    fileNames = body.fileNames || []
    notifyEmail = body.notifyEmail

    if (!galleryId || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing galleryId or imageKeys' }, 400, corsHeaders)
    }
    if (!notifyEmail) {
      return jsonResponse({ ok: false, error: 'Missing notifyEmail' }, 400, corsHeaders)
    }

    const galleryResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/galleries?id=eq.${galleryId}&photographer_id=eq.${photographerId}&select=id`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    )
    const galleries = await galleryResp.json()
    if (!galleries?.length) {
      return jsonResponse({ ok: false, error: 'Gallery not found' }, 404, corsHeaders)
    }

  } else if (hasShareToken) {
    isClientRequest = true
    const shareAuth = await verifyShareToken(request, env, true)
    if (!shareAuth.valid) {
      return jsonResponse({ ok: false, error: shareAuth.error, needsPin: shareAuth.needsPin }, 403, corsHeaders)
    }
    if (!shareAuth.allowDownloads) {
      return jsonResponse({ ok: false, error: 'Downloads are not enabled for this gallery' }, 403, corsHeaders)
    }
    if (!shareAuth.allowHiresDownload) {
      return jsonResponse(
        { ok: false, error: 'High resolution downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }
    photographerId = shareAuth.photographerId
    galleryId = shareAuth.galleryId

    let body
    try { body = await request.json() } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders)
    }
    imageKeys = body.imageKeys || []
    fileNames = body.fileNames || []
    notifyEmail = body.notifyEmail
    viewerId = body.viewerId || null

    if (!Array.isArray(imageKeys) || imageKeys.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing imageKeys' }, 400, corsHeaders)
    }
    if (!notifyEmail) {
      return jsonResponse({ ok: false, error: 'Missing notifyEmail' }, 400, corsHeaders)
    }

  } else {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  // Security: all keys must belong to this photographer/gallery and be original keys
  const expectedPrefix = `photographers/${photographerId}/galleries/${galleryId}/`
  const allValid = imageKeys.every(k => k.startsWith(expectedPrefix) && k.includes('/original/'))
  if (!allValid) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid image keys' }, 403, corsHeaders)
  }

  // Cross-check the requested keys against gallery_images -- doubles as a
  // second ownership check beyond the R2 key prefix match above, and gives
  // us real file sizes for estimated_total_bytes.
  const keysParam = imageKeys.map(k => `"${k}"`).join(',')
  const sizesResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/gallery_images?gallery_id=eq.${galleryId}&original_r2_key=in.(${keysParam})&select=original_r2_key,file_size`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  const sizeRows = await sizesResp.json()
  if (!Array.isArray(sizeRows) || sizeRows.length !== imageKeys.length) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid image keys' }, 403, corsHeaders)
  }
  const estimatedTotalBytes = sizeRows.reduce((sum, row) => sum + (row.file_size || 0), 0)

  // Create the zip_jobs row
  const insertResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/zip_jobs`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        gallery_id: galleryId,
        requested_by_viewer_id: isClientRequest ? viewerId : null,
        requested_by_photographer_id: isClientRequest ? null : photographerId,
        image_count: imageKeys.length,
        estimated_total_bytes: estimatedTotalBytes,
        notify_email: notifyEmail,
      }),
    }
  )
  if (!insertResp.ok) {
    const errText = await insertResp.text()
    console.error('zip_jobs insert failed:', errText)
    return jsonResponse({ ok: false, error: 'Failed to create download job' }, 500, corsHeaders)
  }
  const [job] = await insertResp.json()

  // Trigger the Workflow -- runs independently of this request, no client
  // connection needed for the rest of the job's lifetime.
  await env.ZIP_QUEUE_WORKFLOW.create({
    id: job.id,
    params: {
      jobId: job.id,
      galleryId,
      photographerId,
      imageKeys,
      fileNames,
      notifyEmail,
    },
  })

  return jsonResponse({ ok: true, jobId: job.id }, 200, corsHeaders)
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
