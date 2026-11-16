import { rpc, json, UUID_RE, SHARE_TOKEN_RE } from '../utils/supabase.js'

/**
 * POST /shot-list-upload
 * A client (or anyone on a group shoot's shot list) adds their own pose
 * reference. No login: the shot list's share token plus the visitor's own
 * viewer id (from get_or_create_shot_list_viewer_by_token) are the
 * credentials, the same model as gallery favorites/comments.
 *
 * Form fields:
 *   file      - the image, already compressed in the browser (WebP or JPEG)
 *   token     - the shot list's share token
 *   viewer_id - the visitor's viewer id
 *   width, height - optional pixel size (from the browser)
 *
 * The worker builds the R2 key itself; the browser never chooses it. The
 * database (record_shot_list_upload) re-checks everything -- list active and
 * unlocked, uploads allowed, the per-viewer limit -- records the item
 * (pending when approval is on) and adds the bytes to the photographer's
 * storage. If it refuses, the stored file is deleted again.
 *
 * Rate limited per IP in index.js (RATE_LIMIT_SHOT_LIST).
 */

export const MAX_SHOT_LIST_UPLOAD_BYTES = 5 * 1024 * 1024

export async function handleShotListUpload(request, env, corsHeaders) {
  let form
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, error: 'Invalid form data' }, 400, corsHeaders)
  }

  const file = form.get('file')
  const token = String(form.get('token') || '')
  const viewerId = String(form.get('viewer_id') || '')

  if (!SHARE_TOKEN_RE.test(token) || !UUID_RE.test(viewerId)) {
    return json({ ok: false, error: 'Invalid shot list link' }, 400, corsHeaders)
  }
  if (!file || typeof file === 'string') {
    return json({ ok: false, error: 'No file' }, 400, corsHeaders)
  }
  if (file.size <= 0 || file.size > MAX_SHOT_LIST_UPLOAD_BYTES) {
    return json({ ok: false, error: 'Image must be 5 MB or smaller' }, 413, corsHeaders)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImage(bytes)
  if (!kind) {
    return json({ ok: false, error: 'Only WebP or JPEG images can be added' }, 415, corsHeaders)
  }

  // Cheap pre-check so a refused upload never touches R2.
  const list = await rpc(env, 'get_shot_list_by_token', { p_token: token, p_viewer_id: viewerId })
  if (!list.ok) return json({ ok: false, error: 'Could not check the shot list' }, 502, corsHeaders)
  if (!list.data) return json({ ok: false, error: 'Shot list not available' }, 404, corsHeaders)
  if (!list.data.viewer) return json({ ok: false, error: 'Viewer not on this shot list' }, 403, corsHeaders)
  if (!list.data.allow_uploads) return json({ ok: false, error: 'Uploads are turned off' }, 403, corsHeaders)
  if (list.data.is_locked) return json({ ok: false, error: 'This shot list is locked' }, 403, corsHeaders)
  if (list.data.viewer.uploads_used >= list.data.max_uploads_per_viewer) {
    return json({ ok: false, error: 'Upload limit reached' }, 403, corsHeaders)
  }

  const key = `photographers/${list.data.photographer_id}/poses/lists/${list.data.id}/${crypto.randomUUID()}.${kind.ext}`
  await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: kind.type, cacheControl: 'private, no-cache' },
    customMetadata: {
      photographerId: list.data.photographer_id,
      shotListId: list.data.id,
      viewerId,
      uploadedAt: new Date().toISOString(),
      type: 'shot-list-upload',
    },
  })

  const recorded = await rpc(env, 'record_shot_list_upload', {
    p_token: token,
    p_viewer_id: viewerId,
    p_r2_key: key,
    p_file_size: bytes.length,
    p_width: dimension(form.get('width')),
    p_height: dimension(form.get('height')),
  })
  if (!recorded.ok) {
    await env.BUCKET.delete(key).catch(() => {})
    return json({ ok: false, error: recorded.error }, 400, corsHeaders)
  }

  return json({ ok: true, item: recorded.data }, 200, corsHeaders)
}

// Trust the file's own bytes, not the browser's content type.
export function sniffImage(b) {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { type: 'image/webp', ext: 'webp' }
  }
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { type: 'image/jpeg', ext: 'jpg' }
  }
  return null
}

function dimension(v) {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : null
}
