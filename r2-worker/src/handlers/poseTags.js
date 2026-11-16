import { verifyJWT } from '../middleware/auth.js'
import { rpc, rest, json, UUID_RE } from '../utils/supabase.js'
import { POSE_TAG_MODEL, buildPosePrompt, extractReply, cleanSuggestions } from '../utils/poseTagging.js'

/**
 * POST /poses/suggest-tags   { "image_id": "<pose_library_images id>" }
 * Photographer (JWT). Asks Gemma 4 on Workers AI for tag suggestions for
 * one Pose Library image and stores them on the image as suggestions
 * (suggested_tags, suggested_new_tags, ai_description). Nothing is applied
 * to the image's real tags -- the photographer accepts suggestions in the app.
 *
 * Only runs when an admin has turned on the 'ai_tag_suggestions' feature for
 * the account and the account is under its daily cap (ai_request_allowed);
 * every call is logged to ai_usage_log. The image never leaves Cloudflare:
 * it's read from R2 and sent to Workers AI.
 */

const FEATURE = 'ai_tag_suggestions'

export async function handleSuggestPoseTags(request, env, corsHeaders) {
  const auth = await verifyJWT(request, env)
  if (!auth.valid) return json({ ok: false, error: auth.error }, 401, corsHeaders)

  const body = await request.json().catch(() => null)
  const imageId = body?.image_id
  if (!UUID_RE.test(imageId || '')) return json({ ok: false, error: 'image_id required' }, 400, corsHeaders)

  const dailyCap = Number.parseInt(env.AI_TAG_DAILY_CAP || '300', 10)
  const allowed = await rpc(env, 'ai_request_allowed', {
    p_photographer_id: auth.userId, p_feature: FEATURE, p_daily_cap: dailyCap,
  })
  if (!allowed.ok) return json({ ok: false, error: 'Could not check AI access' }, 502, corsHeaders)
  if (allowed.data !== true) {
    return json({ ok: false, error: 'AI tag suggestions are not available for this account right now' }, 403, corsHeaders)
  }

  // The image must be the caller's own.
  const img = await rest(env,
    `pose_library_images?id=eq.${imageId}&photographer_id=eq.${auth.userId}&select=id,r2_key,tags`)
  if (!img.ok) return json({ ok: false, error: 'Could not load the image' }, 502, corsHeaders)
  const image = img.data?.[0]
  if (!image) return json({ ok: false, error: 'Image not found' }, 404, corsHeaders)

  const groups = await loadVocabulary(env, auth.userId)
  if (!groups) return json({ ok: false, error: 'Could not load your tag list' }, 502, corsHeaders)
  if (!groups.some(g => g.tags.length)) {
    return json({ ok: false, error: 'Your tag list is empty' }, 409, corsHeaders)
  }

  const object = await env.BUCKET.get(image.r2_key)
  if (!object) return json({ ok: false, error: 'Image file not found' }, 404, corsHeaders)
  const bytes = new Uint8Array(await object.arrayBuffer())
  const dataUri = await toModelImage(bytes, object.httpMetadata?.contentType)

  let result, ok = true
  try {
    result = await env.AI.run(POSE_TAG_MODEL, {
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUri } }, // Gemma: image before text
        { type: 'text', text: buildPosePrompt(groups) },
      ] }],
      // Gemma 4 thinks before answering by default and can spend the whole
      // budget doing it; this turns that off (tested Nov 15).
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: 1024,
      temperature: 0.2,
    })
  } catch (err) {
    console.error('Workers AI error:', err)
    ok = false
  }

  const usage = result?.usage || {}
  await rest(env, 'ai_usage_log', {
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      photographer_id: auth.userId, feature: FEATURE, image_id: image.id, model: POSE_TAG_MODEL,
      tokens_in: usage.prompt_tokens ?? null, tokens_out: usage.completion_tokens ?? null,
      neurons: usage.neurons ?? null, ok,
    },
  })
  if (!ok) return json({ ok: false, error: 'The AI service did not answer. Try again in a moment.' }, 502, corsHeaders)

  const reply = extractReply(result)
  if (!reply) return json({ ok: false, error: 'The AI reply could not be read. Try again.' }, 502, corsHeaders)
  const { tags, newTags, description } = cleanSuggestions(reply, groups, image.tags || [])

  const saved = await rest(env, `pose_library_images?id=eq.${image.id}&photographer_id=eq.${auth.userId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { suggested_tags: tags, suggested_new_tags: newTags, ai_description: description || null },
  })
  if (!saved.ok) return json({ ok: false, error: 'Could not save the suggestions' }, 502, corsHeaders)

  return json({ ok: true, image_id: image.id, suggested_tags: tags, suggested_new_tags: newTags, description }, 200, corsHeaders)
}

// The photographer's groups with their AI-eligible tags (manual-only left out).
async function loadVocabulary(env, photographerId) {
  const [g, v] = await Promise.all([
    rest(env, `pose_tag_groups?photographer_id=eq.${photographerId}&select=id,name,single_choice,sort_order&order=sort_order`),
    rest(env, `pose_tag_vocabulary?photographer_id=eq.${photographerId}&manual_only=eq.false&select=tag,definition,group_id,sort_order&order=sort_order`),
  ])
  if (!g.ok || !v.ok) return null
  return g.data.map(group => ({
    name: group.name,
    single_choice: group.single_choice,
    tags: v.data.filter(t => t.group_id === group.id).map(t => ({ tag: t.tag, definition: t.definition })),
  }))
}

// Library images are WebP. The model was tested with JPEG, so convert with
// Photon when it's available; fall back to sending the stored format.
async function toModelImage(bytes, contentType) {
  try {
    const { PhotonImage } = await import('@cf-wasm/photon/workerd')
    const img = PhotonImage.new_from_byteslice(bytes)
    const jpeg = img.get_bytes_jpeg(85)
    img.free()
    return `data:image/jpeg;base64,${toBase64(jpeg)}`
  } catch {
    return `data:${contentType || 'image/webp'};base64,${toBase64(bytes)}`
  }
}

function toBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
