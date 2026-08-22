/**
 * zipQueueWorkflow.js — Tier 3 async ZIP job Workflow
 *
 * Triggered by POST /zip-jobs (see handlers/zip-jobs.js). Runs
 * independently of the original request -- no client connection needed
 * for the rest of its lifetime.
 *
 * Step shape, per docs/tier3-async-zip-queue-spec.md section 3 and the
 * decisions in section 7:
 *   1. mark-processing         -- zip_jobs.status = 'processing'
 *   2. fetch-image-N (one per image) -- fetch from R2, write bytes
 *      STRAIGHT to an R2 scratch key, return only small metadata
 *      (scratchKey, size, crc, name). Confirmed via spike (Aug 21, 2026,
 *      see git history) that Workflow step OUTPUTS are capped at 1MiB --
 *      raw image bytes must never be returned from a step.
 *      Per the skip-and-continue decision: if a fetch step exhausts
 *      Workflows' default retries, it's caught here in run() (not
 *      inside the step) and recorded as skipped rather than failing
 *      the whole job.
 *   3. build-and-upload-zip    -- reads scratch objects back from R2
 *      (not from step state), builds the ZIP structure, batches into
 *      R2-multipart-safe parts (fold any under-5MiB trailing remainder
 *      into the previous part), uploads via multipart -- all within
 *      this one step, so raw part bytes never cross a step boundary
 *      either.
 *   4. cleanup-scratch         -- best-effort delete of scratch objects
 *   5. mark-ready OR mark-failed
 *   6. send-ready-email OR send-failed-email
 *
 * If every single image fails to fetch, the job is marked 'failed'
 * outright rather than producing an empty ZIP.
 */

import { WorkflowEntrypoint } from 'cloudflare:workers'

export class ZipQueueWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, imageKeys, fileNames } = event.payload
    const runPrefix = `zip-jobs/scratch/${jobId}`
    const zipKey = `zip-jobs/${jobId}.zip`
    const MIN_PART_SIZE = 5 * 1024 * 1024 // R2 multipart minimum, except the last part

    await step.do('mark-processing', async () => {
      await updateJob(this.env, jobId, {
        status: 'processing',
        started_at: new Date().toISOString(),
      })
    })

    // One step per image. A fetch that exhausts Workflows' default
    // retries rejects -- caught here (outside the step) so it only
    // skips that one image rather than failing the whole job.
    const fetched = []
    const skippedImages = []

    for (let i = 0; i < imageKeys.length; i++) {
      const key = imageKeys[i]
      const fileName = fileNames[i] || key.split('/').pop() || `image-${i}`
      const scratchKey = `${runPrefix}/image-${i}.bin`

      try {
        const result = await step.do(`fetch-image-${i}`, async () => {
          const obj = await this.env.BUCKET.get(key)
          if (!obj) throw new Error('Image not found in R2')
          const bytes = new Uint8Array(await obj.arrayBuffer())
          const crc = await crc32(bytes)
          await this.env.BUCKET.put(scratchKey, bytes)
          return { scratchKey, size: bytes.length, crc, name: fileName }
        })
        fetched.push(result)
      } catch (err) {
        console.error(`Image fetch exhausted retries, skipping: ${key}`, err)
        skippedImages.push({ key, fileName, error: String(err?.message || err) })
      }
    }

    // If literally nothing could be fetched, this is a real job failure,
    // not a partial success -- an empty ZIP helps no one.
    if (fetched.length === 0) {
      await step.do('mark-failed-no-images', async () => {
        await updateJob(this.env, jobId, {
          status: 'failed',
          error_message: 'All images failed to download.',
          skipped_images: skippedImages,
          completed_at: new Date().toISOString(),
        })
      })
      await sendFailedEmail(this.env, jobId, step)
      return { jobId, status: 'failed', reason: 'all images skipped' }
    }

    // Build the ZIP by reading scratch objects back from R2, batch into
    // multipart-safe parts, and upload -- all within this one step, so
    // no raw bytes (image or ZIP-part) ever cross a step boundary.
    let zipResult
    try {
      zipResult = await step.do('build-and-upload-zip', async () => {
        const centralDirectory = []
        const chunks = []
        let offset = 0
        const encoder = new TextEncoder()

        for (const img of fetched) {
          const obj = await this.env.BUCKET.get(img.scratchKey)
          if (!obj) throw new Error(`Scratch object missing: ${img.scratchKey}`)
          const bytes = new Uint8Array(await obj.arrayBuffer())
          const nameBytes = encoder.encode(img.name)
          const header = new Uint8Array(buildLocalHeader(nameBytes, bytes.length, img.crc))
          chunks.push(header, bytes)
          centralDirectory.push({ nameBytes, length: bytes.length, crc: img.crc, offset })
          offset += header.byteLength + bytes.byteLength
        }

        const centralDirStart = offset
        let centralDirSize = 0
        for (const entry of centralDirectory) {
          const centralEntry = new Uint8Array(
            buildCentralDirectoryEntry(entry.nameBytes, entry.length, entry.crc, entry.offset)
          )
          chunks.push(centralEntry)
          centralDirSize += centralEntry.byteLength
          offset += centralEntry.byteLength
        }

        const eocd = new Uint8Array(buildEndOfCentralDirectory(centralDirectory.length, centralDirSize, centralDirStart))
        chunks.push(eocd)
        offset += eocd.byteLength

        const full = new Uint8Array(offset)
        let pos = 0
        for (const c of chunks) { full.set(c, pos); pos += c.byteLength }

        // Slice into >=5MiB parts, folding any under-sized trailing
        // remainder into the previous part instead of leaving a
        // dangling too-small non-final part (R2 would reject it).
        const parts = []
        let p = 0
        while (p < full.length) {
          const end = Math.min(p + MIN_PART_SIZE, full.length)
          const remaining = full.length - end
          const realEnd = (remaining > 0 && remaining < MIN_PART_SIZE) ? full.length : end
          parts.push(full.slice(p, realEnd))
          p = realEnd
        }

        const upload = await this.env.BUCKET.createMultipartUpload(zipKey)
        const uploadedParts = []
        for (let i = 0; i < parts.length; i++) {
          const uploaded = await upload.uploadPart(i + 1, parts[i])
          uploadedParts.push({ partNumber: uploaded.partNumber, etag: uploaded.etag })
        }
        await upload.complete(uploadedParts)

        return { totalSize: full.length, entryCount: centralDirectory.length }
      })
    } catch (err) {
      console.error('ZIP build/upload failed:', err)
      await step.do('mark-failed-build-error', async () => {
        await updateJob(this.env, jobId, {
          status: 'failed',
          error_message: `Failed to build or upload ZIP: ${String(err?.message || err)}`,
          skipped_images: skippedImages,
          completed_at: new Date().toISOString(),
        })
      })
      await sendFailedEmail(this.env, jobId, step)
      return { jobId, status: 'failed', reason: 'zip build error' }
    }

    // Best-effort cleanup -- catch per-item so one failed delete doesn't
    // trigger a retry of the whole step (nothing downstream depends on
    // this succeeding; leftover scratch objects just sit until the R2
    // lifecycle rule clears them).
    await step.do('cleanup-scratch', async () => {
      for (const img of fetched) {
        try {
          await this.env.BUCKET.delete(img.scratchKey)
        } catch (err) {
          console.error(`Scratch cleanup failed for ${img.scratchKey}:`, err)
        }
      }
      return { attempted: fetched.length }
    })

    await step.do('mark-ready', async () => {
      await updateJob(this.env, jobId, {
        status: 'ready',
        download_r2_key: zipKey,
        images_completed: fetched.length,
        skipped_images: skippedImages,
        completed_at: new Date().toISOString(),
      })
    })

    // Notification failure shouldn't undo an otherwise-successful job --
    // log and move on rather than throwing past this point.
    try {
      await step.do('send-ready-email', async () => {
        await callEmailFunction(this.env, 'send-zip-ready-email', jobId)
      })
    } catch (err) {
      console.error('send-zip-ready-email failed after retries:', err)
    }

    return {
      jobId,
      status: 'ready',
      entryCount: zipResult.entryCount,
      totalSize: zipResult.totalSize,
      skippedCount: skippedImages.length,
    }
  }
}

async function sendFailedEmail(env, jobId, step) {
  try {
    await step.do('send-failed-email', async () => {
      await callEmailFunction(env, 'send-zip-failed-email', jobId)
    })
  } catch (err) {
    console.error('send-zip-failed-email failed after retries:', err)
  }
}

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

async function updateJob(env, jobId, fields) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/zip_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`zip_jobs update failed (${resp.status}): ${text}`)
  }
}

// ─── ZIP format helpers ────────────────────────────────────────────────────
// Ported as-is from r2-worker/src/handlers/zip.js -- same byte-level format
// logic as the existing production streaming download, kept consistent.

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
