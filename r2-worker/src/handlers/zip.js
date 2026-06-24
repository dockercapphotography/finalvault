/**
 * zip.js — ZIP download handler (streaming)
 *
 * POST /download-zip
 * Body: { galleryId, imageKeys, fileNames, size, watermarkIds }
 *   - imageKeys:    always original_r2_key values
 *   - fileNames:    display filenames (_web.jpg suffixed by caller for web ZIPs)
 *   - size:         'web' | 'hires'
 *   - watermarkIds: array of watermark_id per image (parallel to imageKeys), for web ZIPs
 *
 * size=hires: ZIP raw originals as-is
 * size=web:   resize + watermark each image using its stored watermark_id, ZIP as JPEGs
 *
 * Images are fetched and written into the ZIP ONE AT A TIME via a streaming
 * response. Peak memory is bounded by the size of a single image, not the
 * size of the whole gallery — this is what lets large hi-res downloads
 * (hundreds of full-resolution originals) complete without exceeding the
 * Worker's 128MB memory limit, which a previous Promise.all + in-memory-build
 * version did not survive.
 *
 * Tradeoff: this single Worker invocation still runs for as long as it takes
 * to stream every image, so it remains bounded by Cloudflare's per-request
 * wall-clock limit. For galleries large enough to exceed that, a resumable
 * (checkpointed) or async job-queue approach is needed — tracked separately.
 */

import { verifyShareToken } from '../middleware/shareToken.js'
import { verifyJWT } from '../middleware/auth.js'
import { fetchWatermarkById, processWebImage } from '../utils/imageProcess.js'

export async function handleZip(request, env, corsHeaders) {
  const hasJWT = request.headers.get('Authorization')?.startsWith('Bearer ')
  const hasShareToken = !!request.headers.get('X-Share-Token')

  let photographerId
  let galleryId
  let size = 'hires'
  let imageKeys = []
  let fileNames = []
  let watermarkIds = []

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
    size = body.size || 'hires'
    watermarkIds = body.watermarkIds || []

    if (!galleryId || !Array.isArray(imageKeys) || imageKeys.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing galleryId or imageKeys' }, 400, corsHeaders)
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
    size = body.size || 'hires'
    watermarkIds = body.watermarkIds || []

    if (!Array.isArray(imageKeys) || imageKeys.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing imageKeys' }, 400, corsHeaders)
    }

    if (size === 'hires' && !shareAuth.allowHiresDownload) {
      return jsonResponse(
        { ok: false, error: 'High resolution downloads are not enabled for this gallery' },
        403,
        corsHeaders
      )
    }

  } else {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  // Security: all keys must belong to this photographer and be original keys
  const expectedPrefix = `photographers/${photographerId}/galleries/${galleryId}/`
  const allValid = imageKeys.every(k => k.startsWith(expectedPrefix) && k.includes('/original/'))
  if (!allValid) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid image keys' }, 403, corsHeaders)
  }

  // For web ZIPs, pre-fetch unique watermarks to avoid redundant DB/R2 calls.
  // This is small (one image per unique watermark, not per gallery image) so
  // it's fine to keep in memory up front.
  const wmCache = {}
  if (size === 'web') {
    const uniqueIds = [...new Set(watermarkIds.filter(Boolean))]
    await Promise.all(uniqueIds.map(async (wmId) => {
      wmCache[wmId] = await fetchWatermarkById(wmId, env)
    }))
  }

  return streamZipResponse(imageKeys, fileNames, watermarkIds, galleryId, size, wmCache, env, corsHeaders)
}

// ─── Streaming ZIP response ───────────────────────────────────────────────────

function streamZipResponse(imageKeys, fileNames, watermarkIds, galleryId, size, wmCache, env, corsHeaders) {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  // Run the actual work in the background; the Response below returns
  // immediately with the readable side, so the client starts receiving
  // bytes (and can show download progress) right away instead of waiting
  // for the whole archive to be built first.
  writeZipEntries(writer, imageKeys, fileNames, watermarkIds, size, wmCache, env)
    .catch(err => {
      console.error('ZIP stream error:', err)
      writer.abort(err).catch(() => {})
    })

  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/zip')
  headers.set('Content-Disposition', `attachment; filename="gallery-${galleryId}.zip"`)
  // No Content-Length — size isn't known up front since we're streaming.
  return new Response(readable, { status: 200, headers })
}

async function writeZipEntries(writer, imageKeys, fileNames, watermarkIds, size, wmCache, env) {
  const centralDirectory = []
  let offset = 0
  let wroteAny = false

  for (let i = 0; i < imageKeys.length; i++) {
    const key = imageKeys[i]
    try {
      const obj = await env.BUCKET.get(key)
      if (!obj) continue

      const rawBytes = new Uint8Array(await obj.arrayBuffer())
      let finalBytes
      let fileName = fileNames[i] || key.split('/').pop() || `image-${i}`

      if (size === 'web') {
        const wmId = watermarkIds[i] || null
        const wmConfig = wmId ? (wmCache[wmId] || null) : null
        finalBytes = await processWebImage(rawBytes, wmConfig)
        if (!fileName.endsWith('_web.jpg')) {
          fileName = fileName.replace(/\.[^.]+$/, '_web.jpg')
        }
      } else {
        finalBytes = rawBytes
      }

      const fileData = finalBytes instanceof Uint8Array ? finalBytes : new Uint8Array(finalBytes.buffer || finalBytes)
      const encoder = new TextEncoder()
      const nameBytes = encoder.encode(fileName)
      const crc = await crc32(fileData)
      const localHeader = buildLocalHeader(nameBytes, fileData.length, crc)

      await writer.write(new Uint8Array(localHeader))
      await writer.write(fileData)
      wroteAny = true

      centralDirectory.push({ nameBytes, length: fileData.length, crc, offset })
      offset += localHeader.byteLength + fileData.byteLength
    } catch (err) {
      console.error(`Failed to process image ${key}:`, err)
    }
  }

  if (!wroteAny) {
    console.error('ZIP stream: no images were successfully written')
  }

  const centralDirStart = offset
  let centralDirSize = 0
  for (const entry of centralDirectory) {
    const centralEntry = buildCentralDirectoryEntry(entry.nameBytes, entry.length, entry.crc, entry.offset)
    await writer.write(new Uint8Array(centralEntry))
    centralDirSize += centralEntry.byteLength
  }

  const eocd = buildEndOfCentralDirectory(centralDirectory.length, centralDirSize, centralDirStart)
  await writer.write(new Uint8Array(eocd))
  await writer.close()
}

// ─── ZIP format helpers (unchanged byte-level logic, used incrementally) ─────

function buildLocalHeader(nameBytes, fileSize, crc) {
  const buf = new ArrayBuffer(30 + nameBytes.length)
  const view = new DataView(buf)
  view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true)
  view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true)
  view.setUint32(14, crc, true); view.setUint32(18, fileSize, true); view.setUint32(22, fileSize, true)
  view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true)
  new Uint8Array(buf).set(nameBytes, 30)
  return buf
}

function buildCentralDirectoryEntry(nameBytes, fileSize, crc, localOffset) {
  const buf = new ArrayBuffer(46 + nameBytes.length)
  const view = new DataView(buf)
  view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true)
  view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true)
  view.setUint16(14, 0, true); view.setUint32(16, crc, true); view.setUint32(20, fileSize, true)
  view.setUint32(24, fileSize, true); view.setUint16(28, nameBytes.length, true)
  view.setUint16(30, 0, true); view.setUint16(32, 0, true); view.setUint16(34, 0, true)
  view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, localOffset, true)
  new Uint8Array(buf).set(nameBytes, 46)
  return buf
}

function buildEndOfCentralDirectory(count, centralDirSize, centralDirOffset) {
  const buf = new ArrayBuffer(22)
  const view = new DataView(buf)
  view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true)
  view.setUint16(8, count, true); view.setUint16(10, count, true)
  view.setUint32(12, centralDirSize, true); view.setUint32(16, centralDirOffset, true)
  view.setUint16(20, 0, true)
  return buf
}

async function crc32(data) {
  const table = makeCRCTable()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeCRCTable() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c
  }
  return table
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
