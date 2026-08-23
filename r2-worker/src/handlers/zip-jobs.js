/**
 * zip-jobs.js — async ZIP job creation (hi-res + web-size)
 *
 * POST /zip-jobs
 * Body: { galleryId, imageKeys, fileNames, notifyEmail, viewerId, size }
 *   - galleryId:   required only on the photographer (JWT) path; derived
 *                  from the share token on the client path
 *   - imageKeys:   original_r2_key values (same shape as /download-zip)
 *   - fileNames:   display filenames
 *   - notifyEmail: where to send the "your download is ready" email
 *   - viewerId:    gallery_viewers.id, client path only. Optional -- not
 *                  always known at request time (see 026 migration notes),
 *                  so this can be omitted and the job is still created,
 *                  just without an attributable viewer.
 *   - size:        'hires' | 'web', defaults to 'hires'. watermarkIds and
 *                  webKeys are NOT taken from the request body -- they're
 *                  looked up server-side from gallery_images alongside the
 *                  existing file_size cross-check, same trust boundary as
 *                  everything else this endpoint already verifies rather
 *                  than accepts from the client.
 *
 * This replaces both hi-res and web-size calls to /download-zip once a
 * gallery crosses the sync-fallback threshold (25 images AND 250MB for
 * hi-res; same threshold reused for web-size per the v1.5.8 decision).
 * The client decides whether to call this endpoint at all -- smaller
 * galleries should keep calling /download-zip (hires) or the client-side
 * JSZip loop (web) directly instead. This endpoint doesn't re-check that
 * threshold -- queuing a small gallery here isn't a security problem,
 * just a slower path than necessary.
 *
 * Validates the same way /download-zip does (JWT or share token, R2 key
 * ownership prefix check; web-size additionally requires the gallery's
 * download_watermarked flag rather than allow_hires_download), then
 * cross-checks the requested keys against gallery_images (file sizes,
 * watermark_id, web_r2_key).
 *
 * v1.5.8 dedup: before triggering a new Workflow, hashes the sorted
 * imageKeys + size and looks for an existing 'ready', non-expired job on
 * this gallery with the same hash + size. A hit adopts that job's
 * download_r2_key directly (no Workflow run) and sends the ready email
 * immediately; expires_at is capped at the ORIGINAL job's real expiry,
 * not a fresh 7 days, since the underlying R2 file's lifecycle doesn't
 * reset just because a new job row points at it.
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
  let size = 'hires'

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
    size = body.size === 'web' ? 'web' : 'hires'

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
    size = body.size === 'web' ? 'web' : 'hires'

    // v1.5.8: web-size gates on download_watermarked (same permission the
    // existing client-side web-size download already checks), hi-res
    // keeps the original allow_hires_download gate.
    if (size === 'web' && !shareAuth.downloadWatermarked) {
      return jsonResponse(
        { ok: false, error: 'Web-size downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }
    if (size === 'hires' && !shareAuth.allowHiresDownload) {
      return jsonResponse(
        { ok: false, error: 'High resolution downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }

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
  // us real file sizes plus watermark_id/web_r2_key for the Workflow --
  // NOT taken from the client request body, same trust boundary file_size
  // already used before v1.5.8.
  const keysParam = imageKeys.map(k => `"${k}"`).join(',')
  const sizesResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/gallery_images?gallery_id=eq.${galleryId}&original_r2_key=in.(${keysParam})&select=original_r2_key,file_size,watermark_id,web_r2_key`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  const sizeRows = await sizesResp.json()
  if (!Array.isArray(sizeRows) || sizeRows.length !== imageKeys.length) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid image keys' }, 403, corsHeaders)
  }
  const rowsByKey = new Map(sizeRows.map(row => [row.original_r2_key, row]))
  const estimatedTotalBytes = sizeRows.reduce((sum, row) => sum + (row.file_size || 0), 0)
  // Parallel to imageKeys, in the SAME order -- the Supabase `in.()` query
  // above doesn't guarantee row order matches imageKeys order, so these
  // are built explicitly by lookup rather than assumed.
  const watermarkIds = imageKeys.map(k => rowsByKey.get(k)?.watermark_id || null)
  const webKeys = imageKeys.map(k => rowsByKey.get(k)?.web_r2_key || null)

  // v1.5.8 dedup: hash the sorted keys + size, check for an existing
  // ready, non-expired job on this gallery with the same hash. A hit
  // adopts the existing file instead of re-running the whole Workflow.
  const imageKeysHash = await hashImageKeys(imageKeys, size)
  const dedupResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/zip_jobs?gallery_id=eq.${galleryId}&size=eq.${size}&image_keys_hash=eq.${imageKeysHash}&status=eq.ready&expires_at=gt.${new Date().toISOString()}&select=id,download_r2_key,expires_at,images_completed,skipped_images&order=created_at.desc&limit=1`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  const dedupRows = await dedupResp.json()
  const existingJob = Array.isArray(dedupRows) ? dedupRows[0] : null

  if (existingJob) {
    // Cache hit -- create a lightweight job row pointing at the SAME R2
    // file, capped to that file's real expiry (not a fresh 7 days), skip
    // the Workflow entirely, and send the ready email right away.
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
          size,
          image_count: imageKeys.length,
          images_completed: existingJob.images_completed,
          skipped_images: existingJob.skipped_images,
          estimated_total_bytes: estimatedTotalBytes,
          notify_email: notifyEmail,
          image_keys_hash: imageKeysHash,
          status: 'ready',
          download_r2_key: existingJob.download_r2_key,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          expires_at: existingJob.expires_at,
        }),
      }
    )
    if (!insertResp.ok) {
      const errText = await insertResp.text()
      console.error('zip_jobs dedup insert failed:', errText)
      return jsonResponse({ ok: false, error: 'Failed to create download job' }, 500, corsHeaders)
    }
    const [adoptedJob] = await insertResp.json()

    try {
      await callEmailFunction(env, 'send-zip-ready-email', adoptedJob.id)
    } catch (err) {
      console.error('send-zip-ready-email failed for dedup job:', err)
    }

    return jsonResponse({ ok: true, jobId: adoptedJob.id }, 200, corsHeaders)
  }

  // No cache hit -- create the zip_jobs row and run the real Workflow.
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
        size,
        image_count: imageKeys.length,
        estimated_total_bytes: estimatedTotalBytes,
        notify_email: notifyEmail,
        image_keys_hash: imageKeysHash,
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
      size,
      watermarkIds,
      webKeys,
    },
  })

  return jsonResponse({ ok: true, jobId: job.id }, 200, corsHeaders)
}

// Sorted so key ORDER in the request doesn't change the hash -- two
// people selecting the same photos in a different click order should
// still be treated as the same job for dedup purposes.
async function hashImageKeys(imageKeys, size) {
  const sorted = [...imageKeys].sort()
  const input = `${size}|${sorted.join(',')}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Shared with zipQueueWorkflow.js's own copy of this call -- kept as a
// small local duplicate rather than a new shared module, since it's a
// single fetch call and this is the only OTHER place that needs to fire
// the ready email outside of a Workflow step (the dedup cache-hit path
// above never runs the Workflow at all).
async function callEmailFunction(env, functionName, jobId) {
  const resp = await fetch(`${env.SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Zip-Job-Email-Secret': env.ZIP_JOB_EMAIL_SECRET,
    },
    body: JSON.stringify({ jobId }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`${functionName} returned ${resp.status}: ${text}`)
  }
}

/**
 * GET /zip-jobs/:id
 *
 * Status poll endpoint. Not used by the core email-only flow (no in-app
 * polling, per spec decision), but kept for other uses -- e.g. a future
 * photographer-facing job list.
 *
 * Auth model: possessing the job's UUID is treated as authorization,
 * same as every other unguessable-token flow in this app (share tokens,
 * contract sign tokens). No separate share-token/JWT check needed here.
 */
export async function handleZipJobStatus(request, env, corsHeaders, jobId) {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/zip_jobs?id=eq.${jobId}&select=id,status,image_count,images_completed,skipped_images,error_message,expires_at`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  const rows = await resp.json()
  const job = rows?.[0]
  if (!job) {
    return jsonResponse({ ok: false, error: 'Job not found' }, 404, corsHeaders)
  }

  return jsonResponse({
    ok: true,
    id: job.id,
    status: job.status,
    imageCount: job.image_count,
    imagesCompleted: job.images_completed,
    skippedCount: Array.isArray(job.skipped_images) ? job.skipped_images.length : 0,
    errorMessage: job.error_message,
    expiresAt: job.expires_at,
  }, 200, corsHeaders)
}

/**
 * GET /zip-jobs/:id/download
 *
 * Resolves to the finished R2 object once status = 'ready'. Same
 * unguessable-UUID-as-auth model as handleZipJobStatus above -- this is
 * what the "your download is ready" email links to.
 */
export async function handleZipJobDownload(request, env, corsHeaders, jobId) {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/zip_jobs?id=eq.${jobId}&select=id,status,gallery_id,download_r2_key,error_message,expires_at,size`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  const rows = await resp.json()
  const job = rows?.[0]
  if (!job) {
    return jsonResponse({ ok: false, error: 'Job not found' }, 404, corsHeaders)
  }

  if (job.status === 'expired' || (job.expires_at && new Date(job.expires_at) < new Date())) {
    if (job.status !== 'expired') {
      // Lazily mark it -- the R2 lifecycle rule handles actually deleting
      // the object; this just keeps the DB row consistent in the meantime.
      await fetch(`${env.SUPABASE_URL}/rest/v1/zip_jobs?id=eq.${job.id}`, {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'expired' }),
      })
    }
    return jsonResponse({ ok: false, error: 'This download has expired', status: 'expired' }, 410, corsHeaders)
  }

  if (job.status === 'queued' || job.status === 'processing') {
    return jsonResponse({ ok: false, error: 'Your download is not ready yet', status: job.status }, 409, corsHeaders)
  }

  if (job.status === 'failed') {
    return jsonResponse(
      { ok: false, error: job.error_message || 'This download failed to complete.', status: 'failed' },
      422,
      corsHeaders
    )
  }

  // status === 'ready'
  let obj
  try {
    obj = await env.BUCKET.get(job.download_r2_key)
  } catch (err) {
    console.error('R2 fetch error for zip job download:', err)
    return jsonResponse({ ok: false, error: 'Failed to fetch file' }, 500, corsHeaders)
  }
  if (!obj) {
    // Shouldn't happen while status is 'ready' and before expiry, but
    // handle it gracefully rather than a raw 500 if it ever does.
    console.error(`zip_jobs ${job.id} is 'ready' but R2 object missing: ${job.download_r2_key}`)
    return jsonResponse({ ok: false, error: 'File not found' }, 404, corsHeaders)
  }

  const sizeSuffix = job.size === 'web' ? 'web' : 'hires'
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/zip')
  headers.set('Content-Disposition', `attachment; filename="gallery-${job.gallery_id}-${sizeSuffix}.zip"`)
  headers.set('Cache-Control', 'private, no-cache')
  return new Response(obj.body, { status: 200, headers })
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
