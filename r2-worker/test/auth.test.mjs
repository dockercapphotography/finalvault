// Tests for r2-worker/src/middleware/auth.js. Run from the repo root:
//   node --test r2-worker/test/auth.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { verifyJWT, _resetAuthCaches } from '../src/middleware/auth.js'

const SUPABASE_URL = 'https://example.supabase.co'
const enc = new TextEncoder()
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)
const USER = '11111111-2222-3333-4444-555555555555'

async function sign(alg, privateKey, payload, kid) {
  const header = { alg, typ: 'JWT', ...(kid ? { kid } : {}) }
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`
  let sig
  if (alg === 'ES256') sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(input))
  else if (alg === 'RS256') sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(input))
  else if (alg === 'HS256') sig = await crypto.subtle.sign('HMAC', privateKey, enc.encode(input))
  else sig = new Uint8Array(0)
  return `${input}.${b64url(new Uint8Array(sig))}`
}
const req = (token) => new Request('https://w/x', { headers: { Authorization: `Bearer ${token}` } })
const claims = (extra = {}) => ({ sub: USER, role: 'authenticated', aud: 'authenticated', exp: now() + 3600, ...extra })

let ec, ecOther, rsa, jwks, fetchLog, authUserResponse
beforeEach(async () => {
  _resetAuthCaches()
  ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  ecOther = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const ecPub = { ...(await crypto.subtle.exportKey('jwk', ec.publicKey)), kid: 'ec1', alg: 'ES256', use: 'sig', key_ops: ['verify'] }
  const rsaPub = { ...(await crypto.subtle.exportKey('jwk', rsa.publicKey)), kid: 'rs1', alg: 'RS256', use: 'sig', key_ops: ['verify'] }
  jwks = { keys: [ecPub, rsaPub] }
  fetchLog = []
  authUserResponse = { status: 401, body: { message: 'invalid JWT' } }
  globalThis.fetch = async (url) => {
    fetchLog.push(String(url))
    if (String(url).endsWith('/auth/v1/.well-known/jwks.json')) return Response.json(jwks)
    if (String(url).endsWith('/auth/v1/user')) return Response.json(authUserResponse.body, { status: authUserResponse.status })
    throw new Error('unexpected fetch ' + url)
  }
})
const env = (extra = {}) => ({ SUPABASE_URL, SUPABASE_SERVICE_KEY: 'sb_secret_x', ...extra })

test('ES256 token signed by the project key is accepted', async () => {
  const r = await verifyJWT(req(await sign('ES256', ec.privateKey, claims(), 'ec1')), env())
  assert.equal(r.valid, true)
  assert.equal(r.userId, USER)
})

test('RS256 token signed by the project key is accepted', async () => {
  const r = await verifyJWT(req(await sign('RS256', rsa.privateKey, claims(), 'rs1')), env())
  assert.equal(r.valid, true)
})

test('JWKS is cached between requests', async () => {
  const t = await sign('ES256', ec.privateKey, claims(), 'ec1')
  await verifyJWT(req(t), env()); await verifyJWT(req(t), env())
  assert.equal(fetchLog.filter(u => u.includes('jwks')).length, 1)
})

test('forged ES256 token (someone else\'s key, real kid) is rejected', async () => {
  const r = await verifyJWT(req(await sign('ES256', ecOther.privateKey, claims(), 'ec1')), env())
  assert.equal(r.valid, false)
  assert.match(r.error, /signature/)
})

test('unknown kid refetches the keys once, then rejects', async () => {
  const r = await verifyJWT(req(await sign('ES256', ec.privateKey, claims(), 'nope')), env())
  assert.equal(r.valid, false)
  assert.equal(fetchLog.filter(u => u.includes('jwks')).length, 2)
})

test('rotated key: new kid found after refetch', async () => {
  const t = await sign('ES256', ec.privateKey, claims(), 'ec1')
  await verifyJWT(req(t), env())
  const ec2 = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  jwks.keys.push({ ...(await crypto.subtle.exportKey('jwk', ec2.publicKey)), kid: 'ec2', alg: 'ES256' })
  const r = await verifyJWT(req(await sign('ES256', ec2.privateKey, claims(), 'ec2')), env())
  assert.equal(r.valid, true)
})

test('alg "none" and unsigned tokens are rejected', async () => {
  for (const alg of ['none', 'NONE', 'HS512']) {
    const r = await verifyJWT(req(await sign(alg, null, claims())), env())
    assert.equal(r.valid, false, alg)
  }
})

test('the old hole: a hand-made HS256 token is rejected when Supabase says no', async () => {
  const fakeKey = await crypto.subtle.importKey('raw', enc.encode('guess'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const r = await verifyJWT(req(await sign('HS256', fakeKey, claims())), env())
  assert.equal(r.valid, false)
  assert.ok(fetchLog.some(u => u.endsWith('/auth/v1/user')))
})

test('HS256 confirmed by Supabase is accepted and remembered', async () => {
  authUserResponse = { status: 200, body: { id: USER } }
  const k = await crypto.subtle.importKey('raw', enc.encode('real'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const t = await sign('HS256', k, claims())
  assert.equal((await verifyJWT(req(t), env())).valid, true)
  assert.equal((await verifyJWT(req(t), env())).valid, true)
  assert.equal(fetchLog.filter(u => u.endsWith('/auth/v1/user')).length, 1)
})

test('HS256 where Supabase returns a different user is rejected', async () => {
  authUserResponse = { status: 200, body: { id: 'someone-else' } }
  const k = await crypto.subtle.importKey('raw', enc.encode('real'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  assert.equal((await verifyJWT(req(await sign('HS256', k, claims())), env())).valid, false)
})

test('HS256 with SUPABASE_JWT_SECRET is checked locally', async () => {
  const k = await crypto.subtle.importKey('raw', enc.encode('shh'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const good = await verifyJWT(req(await sign('HS256', k, claims())), env({ SUPABASE_JWT_SECRET: 'shh' }))
  const bad = await verifyJWT(req(await sign('HS256', k, claims())), env({ SUPABASE_JWT_SECRET: 'other' }))
  assert.equal(good.valid, true)
  assert.equal(bad.valid, false)
  assert.equal(fetchLog.length, 0)
})

test('expired, missing exp, missing sub, wrong role are rejected', async () => {
  const cases = [claims({ exp: now() - 10 }), claims({ exp: undefined }), claims({ sub: undefined }), claims({ role: 'anon' }), claims({ role: 'service_role' })]
  for (const c of cases) {
    const r = await verifyJWT(req(await sign('ES256', ec.privateKey, c, 'ec1')), env())
    assert.equal(r.valid, false, JSON.stringify(c))
  }
})

test('malformed headers are rejected', async () => {
  assert.equal((await verifyJWT(new Request('https://w/x'), env())).valid, false)
  assert.equal((await verifyJWT(req('abc'), env())).valid, false)
  assert.equal((await verifyJWT(req('a.b.c'), env())).valid, false)
})

test('JWKS outage fails closed', async () => {
  globalThis.fetch = async () => new Response('down', { status: 503 })
  const r = await verifyJWT(req(await sign('ES256', ec.privateKey, claims(), 'ec1')), env())
  assert.equal(r.valid, false)
})
