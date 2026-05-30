/**
 * zip.js — ZIP download handler
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

  // For web ZIPs, pre-fetch unique watermarks to avoid redundant DB/R2 calls
  const wmCache = {}
  if (size === 'web') {
    const uniqueIds = [...new Set(watermarkIds.filter(Boolean))]
    await Promise.all(uniqueIds.map(async (wmId) => {
      wmCache[wmId] = await fetchWatermarkById(wmId, env)
    }))
  }

  return buildAndSendZip(imageKeys, fileNames, watermarkIds, galleryId, size, wmCache, env, corsHeaders)
}

async function buildAndSendZip(imageKeys, fileNames, watermarkIds, galleryId, size, wmCache, env, corsHeaders) {
  try {
    const fetched = await Promise.all(
      imageKeys.map(async (key, i) => {
        try {
          const obj = await env.BUCKET.get(key)
          if (!obj) return null

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

          return { fileName, buffer: finalBytes.buffer || finalBytes }
        } catch (err) {
          console.error(`Failed to process image ${key}:`, err)
          return null
        }
      })
    )

    const files = fetched.filter(Boolean)
    if (files.length === 0) {
      return jsonResponse({ ok: false, error: 'No images found' }, 404, corsHeaders)
    }

    const zipBytes = await buildZip(files)
    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'application/zip')
    headers.set('Content-Disposition', `attachment; filename="gallery-${galleryId}.zip"`)
    headers.set('Content-Length', zipBytes.byteLength.toString())
    return new Response(zipBytes, { status: 200, headers })
  } catch (err) {
    console.error('ZIP error:', err)
    return jsonResponse({ ok: false, error: 'ZIP generation failed: ' + err.message }, 500, corsHeaders)
  }
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

async function buildZip(files) {
  const encoder = new TextEncoder()
  const parts = []
  const centralDirectory = []
  let offset = 0

  for (const { fileName, buffer } of files) {
    const nameBytes = encoder.encode(fileName)
    const fileData = new Uint8Array(buffer)
    const crc = await crc32(fileData)
    const localHeader = buildLocalHeader(nameBytes, fileData.length, crc)
    parts.push(localHeader)
    parts.push(fileData)
    centralDirectory.push({ nameBytes, fileData, localHeader, crc, offset })
    offset += localHeader.byteLength + fileData.byteLength
  }

  const centralDirStart = offset
  let centralDirSize = 0
  for (const entry of centralDirectory) {
    const centralEntry = buildCentralDirectoryEntry(entry.nameBytes, entry.fileData.length, entry.crc, entry.offset)
    parts.push(centralEntry)
    centralDirSize += centralEntry.byteLength
  }

  const eocd = buildEndOfCentralDirectory(centralDirectory.length, centralDirSize, centralDirStart)
  parts.push(eocd)

  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const part of parts) { result.set(new Uint8Array(part), pos); pos += part.byteLength }
  return result.buffer
}

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
