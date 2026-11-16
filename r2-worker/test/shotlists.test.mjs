// Tests for the v1.7.0 worker routes: shot list uploads, shot list previews,
// AI pose-tag suggestions and the prompt/reply helpers.
// Run from the repo root:  node --test r2-worker/test/
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { handleShotListUpload, sniffImage } from '../src/handlers/shotListUpload.js'
import { verifyShotListAccess } from '../src/middleware/shotListAccess.js'
import { handleSuggestPoseTags } from '../src/handlers/poseTags.js'
import { buildPosePrompt, extractReply, cleanSuggestions } from '../src/utils/poseTagging.js'
import { _resetAuthCaches } from '../src/middleware/auth.js'

const CORS = { 'Access-Control-Allow-Origin': '*' }
const PID = 'c35ba281-3f52-48bc-8e01-df2932957ebc'
const LIST = 'a1000000-0000-0000-0000-000000000001'
const VIEWER = 'b2000000-0000-0000-0000-000000000002'
const TOKEN = '0123456789abcdef0123456789abcdef'
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0])

// ── fakes ────────────────────────────────────────────────────────────────
let calls, rpcAnswers, restAnswers, bucket
function fakeBucket() {
  const store = new Map()
  return {
    store,
    async put(k, v, opts) { store.set(k, { v, opts }) },
    async delete(k) { store.delete(k) },
    async get(k) {
      const o = store.get(k)
      return o ? { arrayBuffer: async () => o.v.buffer ?? o.v, httpMetadata: o.opts?.httpMetadata } : null
    },
  }
}
beforeEach(() => {
  _resetAuthCaches()
  calls = []
  rpcAnswers = {}
  restAnswers = []
  bucket = fakeBucket()
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    calls.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined })
    const rpcName = u.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1]
    if (rpcName) {
      const a = typeof rpcAnswers[rpcName] === 'function' ? rpcAnswers[rpcName](JSON.parse(init.body)) : rpcAnswers[rpcName]
      return a?.error ? Response.json({ message: a.error }, { status: 400 }) : Response.json(a?.data ?? null)
    }
    if (u.endsWith('/auth/v1/user')) return Response.json({ id: PID })
    if (u.includes('/rest/v1/')) {
      const hit = restAnswers.find(r => u.includes(r.match) && (r.method || 'GET') === (init.method || 'GET'))
      if (hit?.status === 204) return new Response(null, { status: 204 })
      return hit ? Response.json(hit.data ?? null, { status: hit.status || 200 }) : Response.json([], { status: 200 })
    }
    throw new Error('unexpected fetch ' + u)
  }
})
const env = (extra = {}) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k', BUCKET: bucket, ...extra })

function uploadRequest({ file = WEBP, type = 'image/webp', token = TOKEN, viewer = VIEWER, width = '800', height = '1200' } = {}) {
  const fd = new FormData()
  if (file) fd.append('file', new Blob([file], { type }), 'ref.webp')
  fd.append('token', token)
  fd.append('viewer_id', viewer)
  fd.append('width', width)
  fd.append('height', height)
  return new Request('https://w/shot-list-upload', { method: 'POST', body: fd })
}
const openList = (over = {}) => ({
  id: LIST, photographer_id: PID, allow_uploads: true, is_locked: false, max_uploads_per_viewer: 10,
  viewer: { id: VIEWER, display_name: 'Ava', uploads_used: 0 }, ...over,
})

// ── /shot-list-upload ────────────────────────────────────────────────────
test('upload: stores under the list folder with a worker-made key and records it', async () => {
  rpcAnswers.get_shot_list_by_token = { data: openList() }
  rpcAnswers.record_shot_list_upload = (args) => ({ data: { id: 'item1', status: 'pending', image_key: args.p_r2_key } })
  const res = await handleShotListUpload(uploadRequest(), env(), CORS)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.item.status, 'pending')
  const [key] = [...bucket.store.keys()]
  assert.match(key, new RegExp(`^photographers/${PID}/poses/lists/${LIST}/[0-9a-f-]{36}\\.webp$`))
  const rec = calls.find(c => c.url.endsWith('/rpc/record_shot_list_upload')).body
  assert.equal(rec.p_r2_key, key)
  assert.equal(rec.p_file_size, WEBP.length)
  assert.equal(rec.p_width, 800)
})

test('upload: JPEG gets a .jpg key; type comes from the bytes, not the browser', async () => {
  rpcAnswers.get_shot_list_by_token = { data: openList() }
  rpcAnswers.record_shot_list_upload = { data: { id: 'i', status: 'approved' } }
  const res = await handleShotListUpload(uploadRequest({ file: JPEG, type: 'image/webp' }), env(), CORS)
  assert.equal(res.status, 200)
  assert.match([...bucket.store.keys()][0], /\.jpg$/)
  assert.equal([...bucket.store.values()][0].opts.httpMetadata.contentType, 'image/jpeg')
})

test('upload: database refusal deletes the stored file', async () => {
  rpcAnswers.get_shot_list_by_token = { data: openList() }
  rpcAnswers.record_shot_list_upload = { error: 'Upload limit reached' }
  const res = await handleShotListUpload(uploadRequest(), env(), CORS)
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Upload limit reached')
  assert.equal(bucket.store.size, 0)
})

test('upload: refused before touching R2', async () => {
  const cases = [
    [{ token: 'nope' }, null, 400],
    [{ viewer: 'not-a-uuid' }, null, 400],
    [{ file: PNG, type: 'image/png' }, openList(), 415],
    [{ file: null }, openList(), 400],
    [{}, null, 404],
    [{}, openList({ viewer: null }), 403],
    [{}, openList({ allow_uploads: false }), 403],
    [{}, openList({ is_locked: true }), 403],
    [{}, openList({ viewer: { id: VIEWER, uploads_used: 10 } }), 403],
  ]
  for (const [req, list, status] of cases) {
    rpcAnswers.get_shot_list_by_token = { data: list }
    const res = await handleShotListUpload(uploadRequest(req), env(), CORS)
    assert.equal(res.status, status, JSON.stringify({ req: Object.keys(req), list }))
    assert.equal(bucket.store.size, 0)
  }
})

test('upload: over 5 MB is refused', async () => {
  const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(WEBP)
  const res = await handleShotListUpload(uploadRequest({ file: big }), env(), CORS)
  assert.equal(res.status, 413)
})

test('sniffImage', () => {
  assert.equal(sniffImage(WEBP).ext, 'webp')
  assert.equal(sniffImage(JPEG).ext, 'jpg')
  assert.equal(sniffImage(PNG), null)
})

// ── preview access ───────────────────────────────────────────────────────
test('shot list preview: allowed only when the database says the key is on the list', async () => {
  const key = `photographers/${PID}/poses/library/1.webp`
  rpcAnswers.shot_list_key_visible = { data: true }
  const ok = await verifyShotListAccess(key, TOKEN, VIEWER, env())
  assert.deepEqual(ok, { valid: true, photographerId: PID })
  rpcAnswers.shot_list_key_visible = { data: false }
  assert.equal((await verifyShotListAccess(key, TOKEN, null, env())).valid, false)
})

test('shot list preview: junk is refused without a database call', async () => {
  assert.equal((await verifyShotListAccess(`photographers/${PID}/galleries/g/preview/1.webp`, TOKEN, null, env())).valid, false)
  assert.equal((await verifyShotListAccess(`photographers/${PID}/poses/library/1.webp`, 'short', null, env())).valid, false)
  assert.equal((await verifyShotListAccess(`photographers/${PID}/poses/library/1.webp`, TOKEN, 'bad', env())).valid, false)
  assert.equal(calls.length, 0)
})

// ── /poses/suggest-tags ──────────────────────────────────────────────────
const IMG = 'd4000000-0000-0000-0000-000000000004'
function tagRequest(body = { image_id: IMG }) {
  // HS256-style token confirmed via /auth/v1/user in the fake fetch above.
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: PID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}.c2ln`
  return new Request('https://w/poses/suggest-tags', {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function seedVocabulary() {
  restAnswers.push(
    { match: 'pose_library_images?id=eq.', data: [{ id: IMG, r2_key: `photographers/${PID}/poses/library/1.webp`, tags: ['solo'] }] },
    { match: 'pose_tag_groups?', data: [
      { id: 'g1', name: 'people', single_choice: false, sort_order: 1 },
      { id: 'g2', name: 'framing', single_choice: true, sort_order: 2 },
      { id: 'g3', name: 'emphasis', single_choice: false, sort_order: 3 },
    ] },
    { match: 'pose_tag_vocabulary?', data: [
      { tag: 'solo', group_id: 'g1' }, { tag: 'couple', group_id: 'g1' },
      { tag: 'full body', group_id: 'g2', definition: 'head to feet' }, { tag: 'half body', group_id: 'g2' },
      { tag: 'buttocks focus', group_id: 'g3' },
    ] },
    { match: 'ai_usage_log', method: 'POST', status: 201 },
    { match: 'pose_library_images?id=eq.', method: 'PATCH', status: 204 },
  )
}

test('suggest-tags: refused when the account flag is off or the cap is reached', async () => {
  rpcAnswers.ai_request_allowed = { data: false }
  let aiCalled = false
  const res = await handleSuggestPoseTags(tagRequest(), env({ AI: { run: async () => { aiCalled = true } } }), CORS)
  assert.equal(res.status, 403)
  assert.equal(aiCalled, false)
  assert.equal(calls.find(c => c.url.endsWith('/rpc/ai_request_allowed')).body.p_daily_cap, 300)
})

test('suggest-tags: asks Gemma with thinking off, cleans and saves suggestions, logs usage', async () => {
  rpcAnswers.ai_request_allowed = { data: true }
  seedVocabulary()
  await bucket.put(`photographers/${PID}/poses/library/1.webp`, WEBP, { httpMetadata: { contentType: 'image/webp' } })
  let sent
  const AI = { run: async (model, input) => {
    sent = { model, input }
    return { response: { tags: ['people:Solo', 'couple', 'full body', 'half body', 'made up', 'buttocks focus'], new_tags: ['fur rug', 'couple', 'window light', 'x', 'y'], description: ' A couple poses. ' },
             usage: { prompt_tokens: 1161, completion_tokens: 114, neurons: 13.7 } }
  } }
  const res = await handleSuggestPoseTags(tagRequest(), env({ AI, AI_TAG_DAILY_CAP: '50' }), CORS)
  const body = await res.json()
  assert.equal(res.status, 200, JSON.stringify(body))
  assert.equal(sent.model, '@cf/google/gemma-4-26b-a4b-it')
  assert.deepEqual(sent.input.chat_template_kwargs, { enable_thinking: false })
  assert.equal(sent.input.messages[0].content[0].type, 'image_url')
  assert.match(sent.input.messages[0].content[0].image_url.url, /^data:image\//)
  assert.match(sent.input.messages[0].content[1].text, /framing \(pick at most ONE\): full body, half body/)
  // solo already applied, half body dropped (single choice), "made up" off-list
  assert.deepEqual(body.suggested_tags, ['couple', 'full body', 'buttocks focus'])
  assert.deepEqual(body.suggested_new_tags, ['fur rug', 'window light', 'x'])
  assert.equal(body.description, 'A couple poses.')
  const patch = calls.find(c => c.method === 'PATCH')
  assert.match(patch.url, new RegExp(`photographer_id=eq.${PID}`))
  assert.deepEqual(patch.body.suggested_tags, body.suggested_tags)
  const log = calls.find(c => c.url.includes('ai_usage_log')).body
  assert.equal(log.tokens_in, 1161); assert.equal(log.ok, true)
  assert.equal(calls.find(c => c.url.endsWith('/rpc/ai_request_allowed')).body.p_daily_cap, 50)
})

test('suggest-tags: another photographer\'s image is not found', async () => {
  rpcAnswers.ai_request_allowed = { data: true }
  restAnswers.push({ match: 'pose_library_images?id=eq.', data: [] })
  const res = await handleSuggestPoseTags(tagRequest(), env({ AI: { run: async () => ({}) } }), CORS)
  assert.equal(res.status, 404)
})

test('suggest-tags: AI failure is logged as not ok and nothing is saved', async () => {
  rpcAnswers.ai_request_allowed = { data: true }
  seedVocabulary()
  await bucket.put(`photographers/${PID}/poses/library/1.webp`, WEBP, {})
  const res = await handleSuggestPoseTags(tagRequest(), env({ AI: { run: async () => { throw new Error('boom') } } }), CORS)
  assert.equal(res.status, 502)
  assert.equal(calls.find(c => c.url.includes('ai_usage_log')).body.ok, false)
  assert.equal(calls.some(c => c.method === 'PATCH'), false)
})

test('suggest-tags: needs a valid login and image id', async () => {
  const noAuth = new Request('https://w/poses/suggest-tags', { method: 'POST', body: '{}' })
  assert.equal((await handleSuggestPoseTags(noAuth, env(), CORS)).status, 401)
  assert.equal((await handleSuggestPoseTags(tagRequest({ image_id: 'x' }), env(), CORS)).status, 400)
})

// ── helpers ──────────────────────────────────────────────────────────────
test('extractReply handles parsed objects, prose-wrapped JSON and choices[]', () => {
  assert.deepEqual(extractReply({ response: { tags: ['a'] } }).tags, ['a'])
  assert.deepEqual(extractReply({ response: 'Sure!\n```json\n{"tags":["b"],"new_tags":[]}\n```' }).tags, ['b'])
  assert.deepEqual(extractReply({ choices: [{ message: { content: '{"tags":["c"]}' } }] }).tags, ['c'])
  assert.equal(extractReply({ response: 'I cannot help with that.' }), null)
  assert.equal(extractReply({ response: '{"tags": "nope"}' }), null)
})

test('buildPosePrompt leaves out empty groups and marks single choice', () => {
  const p = buildPosePrompt([
    { name: 'framing', single_choice: true, tags: [{ tag: 'full body', definition: 'head to feet' }] },
    { name: 'empty', single_choice: false, tags: [] },
  ])
  assert.match(p, /- framing \(pick at most ONE\): full body/)
  assert.doesNotMatch(p, /- empty/)
  assert.match(p, /"full body": head to feet/)
})

test('cleanSuggestions caps new tags at 3 and drops vocabulary words from them', () => {
  const groups = [{ name: 'people', single_choice: false, tags: [{ tag: 'solo' }] }]
  const r = cleanSuggestions({ tags: ['SOLO', 'solo'], new_tags: ['Solo', 'a', 'b', 'c', 'd'], description: 3 }, groups)
  assert.deepEqual(r.tags, ['solo'])
  assert.deepEqual(r.newTags, ['a', 'b', 'c'])
  assert.equal(r.description, '')
})

// ── /preview wiring ──────────────────────────────────────────────────────
test('preview: ?shot_list= serves an on-list pose privately, refuses others', async () => {
  const { handlePreview } = await import('../src/handlers/preview.js')
  const key = `photographers/${PID}/poses/library/1.webp`
  await bucket.put(key, WEBP, { httpMetadata: { contentType: 'image/webp' } })
  bucket.get = async (k) => k === key
    ? { body: WEBP, httpMetadata: { contentType: 'image/webp' }, httpEtag: '"e"' } : null
  rpcAnswers.shot_list_key_visible = (args) => ({ data: args.p_key === key && args.p_token === TOKEN })
  const ok = await handlePreview(new Request(`https://w/preview/${encodeURIComponent(key)}?shot_list=${TOKEN}&viewer=${VIEWER}`), env(), CORS)
  assert.equal(ok.status, 200)
  assert.match(ok.headers.get('Cache-Control'), /^private/)
  assert.equal(calls.find(c => c.url.endsWith('/rpc/shot_list_key_visible')).body.p_viewer_id, VIEWER)
  const other = `photographers/${PID}/poses/library/2.webp`
  const no = await handlePreview(new Request(`https://w/preview/${encodeURIComponent(other)}?shot_list=${TOKEN}`), env(), CORS)
  assert.equal(no.status, 403)
  const gallery = `photographers/${PID}/galleries/g/preview/1.webp`
  const gal = await handlePreview(new Request(`https://w/preview/${encodeURIComponent(gallery)}?shot_list=${TOKEN}`), env(), CORS)
  assert.equal(gal.status, 403)
})
