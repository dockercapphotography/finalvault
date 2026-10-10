import { test, expect, FIXTURE_GALLERY, COMMENTS_FIXTURE_GALLERY } from '../../fixtures/fixtures.js'
import { adminClient, getTestPhotographerId, createReviewSession, createRequest } from '../../fixtures/reviews.js'

/**
 * R2 worker -- ?review_token= access mode (v1.5.17)
 *
 * The security boundary behind the public review page: a review token
 * may load previews (and covers) from the session's own linked, active
 * galleries -- nothing else. Exercised directly over HTTP against the
 * deployed worker, no browser needed. Responses are secret-gated, so a
 * successful one must be private (never edge-cached).
 */

const WORKER_URL = process.env.VITE_R2_WORKER_URL

let sb
let photographerId

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
})

function previewUrl(key, token) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?review_token=${token}`
}

test.describe('Worker review_token access', () => {
  test('a preview from a linked gallery loads, served as private', async ({ request, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    try {
      const req = await createRequest(sb, photographerId, { session, client })
      const res = await request.get(previewUrl(FIXTURE_GALLERY.images[0].previewR2Key, req.token))
      expect(res.status()).toBe(200)
      expect(res.headers()['cache-control'] || '').toContain('private')
    } finally {
      await cleanup()
    }
  })

  test("a linked gallery's cover loads", async ({ request, withPremiumAccess }) => {
    const { data: gallery } = await sb.from('galleries').select('cover_r2_key').eq('id', FIXTURE_GALLERY.id).single()
    test.skip(!gallery?.cover_r2_key, 'Fixture Gallery has no cover_r2_key set')
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    try {
      const req = await createRequest(sb, photographerId, { session, client })
      const res = await request.get(previewUrl(gallery.cover_r2_key, req.token))
      expect(res.status()).toBe(200)
    } finally {
      await cleanup()
    }
  })

  test("a preview from a gallery that isn't linked to the session is refused", async ({ request, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    try {
      const req = await createRequest(sb, photographerId, { session, client })
      const res = await request.get(previewUrl(COMMENTS_FIXTURE_GALLERY.images[0].previewR2Key, req.token))
      expect(res.status()).toBe(403)
    } finally {
      await cleanup()
    }
  })

  test('an original-size key is refused even from a linked gallery', async ({ request, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    try {
      const req = await createRequest(sb, photographerId, { session, client })
      const res = await request.get(previewUrl(FIXTURE_GALLERY.images[0].originalR2Key, req.token))
      expect(res.status()).toBe(403)
    } finally {
      await cleanup()
    }
  })

  test('a wrong or malformed token is refused', async ({ request, withPremiumAccess }) => {
    const key = FIXTURE_GALLERY.images[0].previewR2Key
    expect((await request.get(previewUrl(key, 'a'.repeat(32)))).status()).toBe(403)
    expect((await request.get(previewUrl(key, 'not-a-token'))).status()).toBe(403)
  })
})
