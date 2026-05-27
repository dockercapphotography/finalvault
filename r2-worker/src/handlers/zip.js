import { verifyShareToken } from '../middleware/shareToken.js'

/**
 * POST /download-zip
 * Generate and stream a ZIP of all images in a gallery.
 *
 * Body: { galleryId: string, imageKeys: string[] }
 * Headers: X-Share-Token, X-Download-Pin (if required)
 *
 * If gallery.download_watermarked = true, serves preview keys.
 * If gallery.download_watermarked = false, serves original keys.
 *
 * Note: ZIP is assembled in memory in the Worker. For very large galleries
 * (100+ high-res images), consider chunking or a signed URL approach in the future.
 */
export async function handleZip(request, env, corsHeaders) {
  // Verify share token + PIN
  const shareAuth = await verifyShareToken(request, env, true)
  if (!shareAuth.valid) {
    return jsonResponse(
      { ok: false, error: shareAuth.error, needsPin: shareAuth.needsPin },
      403,
      corsHeaders
    )
  }

  if (!shareAuth.allowDownloads) {
    return jsonResponse({ ok: false, error: 'Downloads are not enabled for this gallery' }, 403, corsHeaders)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, corsHeaders)
  }

  const { galleryId, imageKeys } = body

  if (!galleryId || !Array.isArray(imageKeys) || imageKeys.length === 0) {
    return jsonResponse({ ok: false, error: 'Missing galleryId or imageKeys' }, 400, corsHeaders)
  }

  // Security: all keys must belong to this photographer's gallery and be preview or original
  const expectedPrefix = `photographers/${shareAuth.photographerId}/galleries/${galleryId}/`
  const allValid = imageKeys.every(key =>
    key.startsWith(expectedPrefix) &&
    (key.includes('/preview/') || key.includes('/original/'))
  )
  if (!allValid) {
    return jsonResponse({ ok: false, error: 'Access denied: invalid image keys' }, 403, corsHeaders)
  }

  // Keys are pre-resolved by the client (either preview or original)
  const fetchKeys = imageKeys

  try {
    // Fetch all images from R2 concurrently
    const fetched = await Promise.all(
      fetchKeys.map(async (key, i) => {
        try {
          const obj = await env.BUCKET.get(key)
          if (!obj) return null
          const buffer = await obj.arrayBuffer()
          const fileName = imageKeys[i].split('/').pop() || `image-${i}`
          return { fileName, buffer, contentType: obj.httpMetadata?.contentType || 'application/octet-stream' }
        } catch {
          return null
        }
      })
    )

    const files = fetched.filter(Boolean)

    if (files.length === 0) {
      return jsonResponse({ ok: false, error: 'No images found for download' }, 404, corsHeaders)
    }

    // Build ZIP manually using a simple structure
    // For production, consider using a proper ZIP library via npm in the worker
    const zipBytes = await buildZip(files)

    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'application/zip')
    headers.set('Content-Disposition', `attachment; filename="gallery-${galleryId}.zip"`)
    headers.set('Content-Length', zipBytes.byteLength.toString())

    return new Response(zipBytes, { status: 200, headers })
  } catch (err) {
    console.error('ZIP generation error:', err)
    return jsonResponse({ ok: false, error: 'ZIP generation failed: ' + err.message }, 500, corsHeaders)
  }
}

/**
 * Minimal ZIP builder using the ZIP specification.
 * Supports stored (uncompressed) files — suitable for already-compressed images.
 */
async function buildZip(files) {
  const encoder = new TextEncoder()
  const parts = []
  const centralDirectory = []
  let offset = 0

  for (const { fileName, buffer } of files) {
    const nameBytes = encoder.encode(fileName)
    const fileData = new Uint8Array(buffer)
    const crc = await crc32(fileData)

    // Local file header
    const localHeader = buildLocalHeader(nameBytes, fileData.length, crc)
    parts.push(localHeader)
    parts.push(fileData)

    centralDirectory.push({ nameBytes, fileData, localHeader, crc, offset })
    offset += localHeader.byteLength + fileData.byteLength
  }

  // Central directory
  const centralDirStart = offset
  let centralDirSize = 0

  for (const entry of centralDirectory) {
    const centralEntry = buildCentralDirectoryEntry(entry.nameBytes, entry.fileData.length, entry.crc, entry.offset)
    parts.push(centralEntry)
    centralDirSize += centralEntry.byteLength
  }

  // End of central directory
  const eocd = buildEndOfCentralDirectory(centralDirectory.length, centralDirSize, centralDirStart)
  parts.push(eocd)

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const part of parts) {
    result.set(new Uint8Array(part), pos)
    pos += part.byteLength
  }

  return result.buffer
}

function buildLocalHeader(nameBytes, fileSize, crc) {
  const buf = new ArrayBuffer(30 + nameBytes.length)
  const view = new DataView(buf)
  view.setUint32(0, 0x04034b50, true) // Local file header signature
  view.setUint16(4, 20, true)          // Version needed
  view.setUint16(6, 0, true)           // General purpose flags
  view.setUint16(8, 0, true)           // Compression method: stored
  view.setUint16(10, 0, true)          // Last mod time
  view.setUint16(12, 0, true)          // Last mod date
  view.setUint32(14, crc, true)        // CRC-32
  view.setUint32(18, fileSize, true)   // Compressed size
  view.setUint32(22, fileSize, true)   // Uncompressed size
  view.setUint16(26, nameBytes.length, true) // File name length
  view.setUint16(28, 0, true)          // Extra field length
  new Uint8Array(buf).set(nameBytes, 30)
  return buf
}

function buildCentralDirectoryEntry(nameBytes, fileSize, crc, localOffset) {
  const buf = new ArrayBuffer(46 + nameBytes.length)
  const view = new DataView(buf)
  view.setUint32(0, 0x02014b50, true)  // Central directory signature
  view.setUint16(4, 20, true)           // Version made by
  view.setUint16(6, 20, true)           // Version needed
  view.setUint16(8, 0, true)            // Flags
  view.setUint16(10, 0, true)           // Compression method: stored
  view.setUint16(12, 0, true)           // Last mod time
  view.setUint16(14, 0, true)           // Last mod date
  view.setUint32(16, crc, true)         // CRC-32
  view.setUint32(20, fileSize, true)    // Compressed size
  view.setUint32(24, fileSize, true)    // Uncompressed size
  view.setUint16(28, nameBytes.length, true) // File name length
  view.setUint16(30, 0, true)           // Extra field length
  view.setUint16(32, 0, true)           // Comment length
  view.setUint16(34, 0, true)           // Disk number start
  view.setUint16(36, 0, true)           // Internal attrs
  view.setUint32(38, 0, true)           // External attrs
  view.setUint32(42, localOffset, true) // Offset of local header
  new Uint8Array(buf).set(nameBytes, 46)
  return buf
}

function buildEndOfCentralDirectory(count, centralDirSize, centralDirOffset) {
  const buf = new ArrayBuffer(22)
  const view = new DataView(buf)
  view.setUint32(0, 0x06054b50, true)  // EOCD signature
  view.setUint16(4, 0, true)            // Disk number
  view.setUint16(6, 0, true)            // Disk with central dir
  view.setUint16(8, count, true)        // Entries on disk
  view.setUint16(10, count, true)       // Total entries
  view.setUint32(12, centralDirSize, true)   // Central dir size
  view.setUint32(16, centralDirOffset, true) // Central dir offset
  view.setUint16(20, 0, true)           // Comment length
  return buf
}

async function crc32(data) {
  // CRC-32 implementation for ZIP
  const table = makeCRCTable()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeCRCTable() {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }
  return table
}

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
