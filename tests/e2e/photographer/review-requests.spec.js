import { test, expect, FIXTURE_GALLERY } from '../../fixtures/fixtures.js'
import {
  adminClient, getTestPhotographerId, createReviewSession, createRequest, insertSubmission, cleanupLeftovers,
} from '../../fixtures/reviews.js'

/**
 * Requesting reviews -- Session Detail's Review card and request modal,
 * plus Client Detail's Reviews card (v1.5.17).
 *
 * Never presses Send request / Save & resend: requests are made with
 * Copy link or inserted directly, so no client email is sent. Copy link's
 * URL is read back from the database rather than the clipboard.
 */

let sb
let photographerId

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
  await cleanupLeftovers(sb, photographerId)
})

function reviewCard(page) {
  return page.locator('#review')
}

// Input.jsx renders <label> then <input> as siblings with no for/id.
function labeledInput(scope, label) {
  return scope.getByText(label, { exact: true }).locator('xpath=../input')
}

test.describe('Review card visibility', () => {
  test('an event (walk-up) session has no Review card', async ({ page, withPremiumAccess }) => {
    const { session, cleanup } = await createReviewSession(sb, photographerId, { mode: 'walkup', withClient: false })
    try {
      await page.goto(`/sessions/${session.id}`)
      await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('heading', { name: 'Review', exact: true })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })

  test('a private session with no client says to link one', async ({ page, withPremiumAccess }) => {
    const { session, cleanup } = await createReviewSession(sb, photographerId, { withClient: false })
    try {
      await page.goto(`/sessions/${session.id}`)
      await expect(page.getByText('Link a client to this session to request a review.')).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('button', { name: 'Request review' })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })

  test('without premium access there is no Review card', async ({ page }) => {
    const { data: hasPremium } = await sb.rpc('photographer_has_premium_access', { p_photographer_id: photographerId })
    test.skip(hasPremium === true, 'test account tier already includes premium features')
    const { session, cleanup } = await createReviewSession(sb, photographerId)
    try {
      await page.goto(`/sessions/${session.id}`)
      await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('heading', { name: 'Review', exact: true })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })
})

test.describe('Request modal', () => {
  test('pre-selects the default template with its variables filled in', async ({ page, withPremiumAccess }) => {
    const { session, cleanup } = await createReviewSession(sb, photographerId)
    try {
      await page.goto(`/sessions/${session.id}`)
      await reviewCard(page).getByRole('button', { name: 'Request review' }).click()
      await expect(page.getByRole('heading', { name: 'Request a review' })).toBeVisible()

      const subject = labeledInput(page, 'Subject')
      await expect(subject).not.toHaveValue('', { timeout: 10000 })
      await expect(subject).not.toHaveValue(/\{\{/)
      await expect(page.locator('textarea').first()).not.toHaveValue(/\{\{/)
      await expect(labeledInput(page, 'Name shown on the review')).toHaveValue('Revi T.')
    } finally {
      await cleanup()
    }
  })

  test('Copy link instead creates exactly one request and sends no email', async ({ page, withPremiumAccess }) => {
    const { session, cleanup } = await createReviewSession(sb, photographerId)
    try {
      await page.goto(`/sessions/${session.id}`)
      await reviewCard(page).getByRole('button', { name: 'Request review' }).click()
      await expect(labeledInput(page, 'Subject')).not.toHaveValue('', { timeout: 10000 })
      await page.getByRole('button', { name: 'Copy link instead' }).click()

      await expect(page.getByText('Review link copied')).toBeVisible({ timeout: 10000 })
      await expect(reviewCard(page).getByText('Link created')).toBeVisible()

      const { data: rows } = await sb.from('testimonial_requests').select('token, last_sent_at, send_count').eq('session_id', session.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].last_sent_at).toBeNull()
      expect(rows[0].send_count).toBe(0)
      expect(rows[0].token).toMatch(/^[a-f0-9]{32}$/)
    } finally {
      await cleanup()
    }
  })

  test('Edit then Save updates the name and suggested photo without emailing', async ({ page, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId, { galleryIds: [FIXTURE_GALLERY.id] })
    try {
      await createRequest(sb, photographerId, { session, client })
      await page.goto(`/sessions/${session.id}`)
      await reviewCard(page).getByRole('button', { name: 'Edit', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Edit review request' })).toBeVisible()

      await labeledInput(page, 'Name shown on the review').fill('R. Tester')
      await page.getByRole('button', { name: 'Choose from session photos' }).click()
      await page.locator('.grid.grid-cols-5 button').first().click()
      await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()

      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('Review request saved')).toBeVisible({ timeout: 10000 })

      const { data: req } = await sb.from('testimonial_requests')
        .select('display_name, suggested_photo_key, last_sent_at').eq('session_id', session.id).single()
      expect(req.display_name).toBe('R. Tester')
      expect(FIXTURE_GALLERY.images.map(i => i.previewR2Key)).toContain(req.suggested_photo_key)
      expect(req.last_sent_at).toBeNull()
    } finally {
      await cleanup()
    }
  })
})

test.describe('Cancelling a request', () => {
  test('Cancel asks first, then removes the request', async ({ page, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    try {
      await createRequest(sb, photographerId, { session, client })
      await page.goto(`/sessions/${session.id}`)
      await reviewCard(page).getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByText('Cancel this request? The review link will stop working.')).toBeVisible()

      await page.getByRole('button', { name: 'Cancel request' }).click()
      await expect(reviewCard(page).getByText('No review requested yet.')).toBeVisible({ timeout: 10000 })

      const { data: rows } = await sb.from('testimonial_requests').select('id').eq('session_id', session.id)
      expect(rows).toHaveLength(0)
    } finally {
      await cleanup()
    }
  })

  test('once the client has submitted, Cancel is gone', async ({ page, withPremiumAccess }) => {
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    try {
      const request = await createRequest(sb, photographerId, { session, client })
      await insertSubmission(sb, photographerId, request)
      await page.goto(`/sessions/${session.id}`)
      await expect(reviewCard(page).getByText('Waiting for approval')).toBeVisible({ timeout: 10000 })
      await expect(reviewCard(page).getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })
})

test.describe('Client Detail — Reviews card', () => {
  test('counts reviews and open requests, and a waiting review opens its session at the Review card', async ({ page, withPremiumAccess }) => {
    const first = await createReviewSession(sb, photographerId)
    // A second session for the SAME client.
    const { data: second, error } = await sb.from('sessions').insert({
      photographer_id: photographerId,
      client_id: first.client.id,
      name: `PW Review Session 2 ${crypto.randomUUID().slice(0, 8)}`,
      type: 'Portrait',
      mode: 'private',
      status: 'inquiry',
      submit_token: crypto.randomUUID().replace(/-/g, ''),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    try {
      const waiting = await createRequest(sb, photographerId, { session: first.session, client: first.client })
      const quote = `Client card review ${crypto.randomUUID().slice(0, 8)}`
      await insertSubmission(sb, photographerId, waiting, { quote })
      await createRequest(sb, photographerId, { session: second, client: first.client })

      await page.goto(`/clients/${first.client.id}`)
      // The session name also appears in the Sessions card, so scope to Reviews.
      const reviewsCard = page.locator('div.rounded-2xl', {
        has: page.getByRole('heading', { name: 'Reviews', exact: true }),
      })
      await expect(reviewsCard).toBeVisible({ timeout: 10000 })
      await expect(reviewsCard.getByText('1 review · 1 request open')).toBeVisible()
      await expect(reviewsCard.getByText(second.name)).toBeVisible()

      await reviewsCard.getByText(quote).click()
      await expect(page).toHaveURL(new RegExp(`/sessions/${first.session.id}#review$`), { timeout: 10000 })
    } finally {
      await sb.from('testimonial_requests').delete().eq('session_id', second.id)
      await sb.from('sessions').delete().eq('id', second.id)
      await first.cleanup()
    }
  })

  test('a client with no requests has no Reviews card', async ({ page, withPremiumAccess }) => {
    const { client, cleanup } = await createReviewSession(sb, photographerId)
    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByText(client.email).first()).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toHaveCount(0)
    } finally {
      await cleanup()
    }
  })
})
