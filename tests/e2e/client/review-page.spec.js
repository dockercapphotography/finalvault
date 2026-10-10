import { test, expect, FIXTURE_GALLERY, COMMENTS_FIXTURE_GALLERY } from '../../fixtures/fixtures.js'
import {
  adminClient, getTestPhotographerId, createReviewSession, createRequest,
  getReviewEmail, setReviewEmail, cleanupLeftovers,
} from '../../fixtures/reviews.js'

/**
 * Public review page -- /review/:token (v1.5.17)
 *
 * Runs as a logged-out visitor (a fresh browser context, not the
 * photographer's storage state). Requests are inserted directly -- the
 * Copy link path -- so no client email is ever sent. The one test that
 * submits for real turns the photographer's "New review" email off first
 * and restores it afterwards (sql/094), so no Resend quota is used.
 *
 * Every test that expects a working page uses withPremiumAccess: the
 * review RPCs treat a photographer without premium as an invalid link.
 */

let sb
let photographerId
let originalReviewEmail

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
  await cleanupLeftovers(sb, photographerId)
  originalReviewEmail = await getReviewEmail(sb, photographerId)
  await setReviewEmail(sb, photographerId, false)
})

test.afterAll(async () => {
  await setReviewEmail(sb, photographerId, originalReviewEmail)
})

async function openAsClient(browser, token) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`/review/${token}`)
  return { ctx, page }
}

test.describe('Review page — rendering', () => {
  test('shows the request: heading, session type and name, name pre-filled as First L.', async ({ browser, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    const request = await createRequest(sb, photographerId, { session, client })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.getByRole('heading', { name: 'How was your session?' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Portrait', { exact: true })).toBeVisible()
      await expect(page.getByText(session.name)).toBeVisible()
      await expect(page.locator('#review-name')).toHaveValue('Revi T.')
    } finally {
      await ctx.close()
      await cleanup()
    }
  })

  test('offers photos from every linked gallery, plus No photo', async ({ browser, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, {
      galleryIds: [FIXTURE_GALLERY.id, COMMENTS_FIXTURE_GALLERY.id],
    })
    const request = await createRequest(sb, photographerId, { session, client })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.getByRole('heading', { name: 'How was your session?' })).toBeVisible({ timeout: 10000 })
      const expected = FIXTURE_GALLERY.images.length + COMMENTS_FIXTURE_GALLERY.images.length
      await expect(page.getByRole('button', { name: 'Choose this photo' })).toHaveCount(expected)
      await expect(page.getByRole('button', { name: 'No photo' })).toBeVisible()
    } finally {
      await ctx.close()
      await cleanup()
    }
  })

  test('a session with no linked gallery skips the photo section entirely', async ({ browser, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    const request = await createRequest(sb, photographerId, { session, client })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.getByRole('heading', { name: 'How was your session?' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Pick a photo to go with it')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'No photo' })).toHaveCount(0)
    } finally {
      await ctx.close()
      await cleanup()
    }
  })

  test('the suggested photo starts selected and is shown first; switching and No photo work', async ({ browser, withPremiumAccess }) => {
    const suggested = FIXTURE_GALLERY.images[2]
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    const request = await createRequest(sb, photographerId, { session, client, suggestedPhotoKey: suggested.previewR2Key })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.getByRole('heading', { name: 'How was your session?' })).toBeVisible({ timeout: 10000 })

      const selected = page.getByRole('button', { name: 'Selected photo' })
      await expect(selected).toHaveCount(1)
      await expect(selected.locator('img')).toHaveAttribute('src', new RegExp(encodeURIComponent(suggested.previewR2Key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

      // Shown first in the grid
      const firstTile = page.locator('button[aria-pressed]').first()
      await expect(firstTile).toHaveAttribute('aria-label', 'Selected photo')

      await page.getByRole('button', { name: 'Choose this photo' }).first().click()
      await expect(page.getByRole('button', { name: 'Selected photo' })).toHaveCount(1)
      await expect(firstTile).toHaveAttribute('aria-label', 'Choose this photo')

      await page.getByRole('button', { name: 'No photo' }).click()
      await expect(page.getByRole('button', { name: 'Selected photo' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'No photo' })).toHaveAttribute('aria-pressed', 'true')
    } finally {
      await ctx.close()
      await cleanup()
    }
  })

  test('Send stays disabled until there is a review, a name, and consent', async ({ browser, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    const request = await createRequest(sb, photographerId, { session, client })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      const send = page.getByRole('button', { name: 'Send review' })
      await expect(send).toBeVisible({ timeout: 10000 })
      await expect(send).toBeDisabled()

      await page.locator('#review-quote').fill('Great session!')
      await expect(page.getByText('14 / 1000')).toBeVisible()
      await expect(send).toBeDisabled()

      await page.getByRole('checkbox').check()
      await expect(send).toBeEnabled()

      await page.locator('#review-name').fill('')
      await expect(send).toBeDisabled()
    } finally {
      await ctx.close()
      await cleanup()
    }
  })
})

test.describe('Review page — submitting', () => {
  test('submits the review with its photo, then shows Review already sent on reopen', async ({ browser, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    const request = await createRequest(sb, photographerId, { session, client })
    const quote = `Playwright review ${crypto.randomUUID().slice(0, 8)}`
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.locator('#review-quote')).toBeVisible({ timeout: 10000 })
      await page.locator('#review-quote').fill(quote)
      await page.getByRole('button', { name: 'Choose this photo' }).first().click()
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Send review' }).click()

      await expect(page.getByRole('heading', { name: 'Thank you, Revi' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(quote)).toBeVisible()

      const { data: sub } = await sb.from('testimonial_submissions')
        .select('quote, name, status, consented_at, photo_r2_key')
        .eq('request_id', request.id).single()
      expect(sub.quote).toBe(quote)
      expect(sub.name).toBe('Revi T.')
      expect(sub.status).toBe('pending')
      expect(sub.consented_at).toBeTruthy()
      expect(FIXTURE_GALLERY.images.map(i => i.previewR2Key)).toContain(sub.photo_r2_key)

      await page.reload()
      await expect(page.getByRole('heading', { name: 'Review already sent' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(quote)).toBeVisible()
    } finally {
      await ctx.close()
      await cleanup()
    }
  })
})

test.describe('Review page — invalid links', () => {
  test('an unknown token shows the invalid-link screen', async ({ browser }) => {
    const { ctx, page } = await openAsClient(browser, 'f'.repeat(32))
    try {
      await expect(page.getByText('This review link is invalid or no longer active.')).toBeVisible({ timeout: 10000 })
    } finally {
      await ctx.close()
    }
  })

  test('a photographer without premium access gets the invalid-link screen', async ({ browser }) => {
    // No withPremiumAccess: the test account's own tier has no premium
    // features. Same skip-guard as premium-feature-gating.spec.js in case
    // that ever changes.
    const { data: hasPremium } = await sb.rpc('photographer_has_premium_access', { p_photographer_id: photographerId })
    test.skip(hasPremium === true, 'test account tier already includes premium features')
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    const request = await createRequest(sb, photographerId, { session, client })
    const { ctx, page } = await openAsClient(browser, request.token)
    try {
      await expect(page.getByText('This review link is invalid or no longer active.')).toBeVisible({ timeout: 10000 })
    } finally {
      await ctx.close()
      await cleanup()
    }
  })
})
