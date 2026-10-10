import { test, expect } from '../../fixtures/fixtures.js'
import {
  adminClient, getTestPhotographerId, createReviewSession, createRequest, insertSubmission,
  ensureMicrosite, getMicrositeTestimonials, cleanupLeftovers,
} from '../../fixtures/reviews.js'

/**
 * Approving reviews -- the Website editor's pending panel and Session
 * Detail's embedded copy of it (v1.5.17).
 *
 * Submissions are inserted directly, so nothing here sends an email.
 * testMicrosite restores the photographer's microsite row (testimonials
 * included) after every test.
 */

let sb
let photographerId

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
  await cleanupLeftovers(sb, photographerId)
})

// Each review gets a unique display name: it shows in its panel row in
// both modes ("— name" and "Editing review from name"), so tests can
// scope to their own row even if other pending reviews exist.
async function pendingReview() {
  const tag = crypto.randomUUID().slice(0, 8)
  const quote = `PW pending ${tag}`
  const name = `Revi ${tag}`
  const made = await createReviewSession(sb, photographerId)
  const request = await createRequest(sb, photographerId, { session: made.session, client: made.client })
  const submission = await insertSubmission(sb, photographerId, request, { quote, name })
  return { ...made, request, submission, quote, name }
}

function panelRow(page, r) {
  return page.getByTestId('pending-reviews').locator(':scope > div').filter({ hasText: r.name })
}

async function openWebsiteEditor(page) {
  await page.goto('/website')
  await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
}

async function submissionRow(id) {
  const { data } = await sb.from('testimonial_submissions').select('*').eq('id', id).single()
  return data
}

test.describe('Website editor — pending reviews', () => {
  test('Approve publishes to the top of the list without leaving unsaved changes', async ({ page, testMicrosite, withPremiumAccess }) => {
    const r = await pendingReview()
    try {
      await openWebsiteEditor(page)
      const row = panelRow(page, r)
      await expect(row.getByText(r.quote)).toBeVisible({ timeout: 10000 })
      // The editor must not open as "unsaved" (patch_v1.5.17_editor_ids).
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

      await row.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(row).toHaveCount(0, { timeout: 10000 })
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()

      const list = await getMicrositeTestimonials(sb, photographerId)
      expect(list[0].submission_id).toBe(r.submission.id)
      expect(list[0].quote).toBe(r.quote)
      expect((await submissionRow(r.submission.id)).status).toBe('approved')
    } finally {
      await r.cleanup()
    }
  })

  test('Edit, Restore original, then Approve with edits keeps the client original on the submission', async ({ page, testMicrosite, withPremiumAccess }) => {
    const r = await pendingReview()
    const edited = `${r.quote} (edited)`
    try {
      await openWebsiteEditor(page)
      const row = panelRow(page, r)
      await row.getByRole('button', { name: 'Edit', exact: true }).click()

      const quoteBox = row.getByText('Quote', { exact: true }).locator('xpath=../textarea')
      await quoteBox.fill('something else entirely')
      await row.getByRole('button', { name: 'Restore original' }).click()
      await expect(quoteBox).toHaveValue(r.quote)

      await quoteBox.fill(edited)
      await row.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(row).toHaveCount(0, { timeout: 10000 })

      const list = await getMicrositeTestimonials(sb, photographerId)
      expect(list[0].quote).toBe(edited)
      expect((await submissionRow(r.submission.id)).quote).toBe(r.quote)
    } finally {
      await r.cleanup()
    }
  })

  test('Reject asks first, then removes the review without publishing it', async ({ page, testMicrosite, withPremiumAccess }) => {
    const r = await pendingReview()
    try {
      await openWebsiteEditor(page)
      const row = panelRow(page, r)
      await row.getByRole('button', { name: 'Reject', exact: true }).click()
      await expect(row.getByText(/Reject this review\?/)).toBeVisible()
      await row.getByRole('button', { name: 'Reject', exact: true }).click()

      await expect(row).toHaveCount(0, { timeout: 10000 })
      expect((await submissionRow(r.submission.id)).status).toBe('rejected')
      const list = await getMicrositeTestimonials(sb, photographerId)
      expect(list.some(t => t.submission_id === r.submission.id)).toBe(false)
    } finally {
      await r.cleanup()
    }
  })

  test('with unsaved changes, Approve and Edit are blocked but Reject still works', async ({ page, testMicrosite, withPremiumAccess }) => {
    const r = await pendingReview()
    try {
      await openWebsiteEditor(page)
      const panel = page.getByTestId('pending-reviews')
      const row = panelRow(page, r)
      await expect(row.getByText(r.quote)).toBeVisible({ timeout: 10000 })
      await expect(row.getByRole('button', { name: 'Approve', exact: true })).toBeEnabled()

      await page.getByPlaceholder('Reviews').fill(`Reviews ${Date.now()}`)
      await expect(panel.getByText('You have unsaved changes on this page. Save them before approving or editing reviews.')).toBeVisible()
      await expect(row.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled()
      await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
      await expect(row.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled()
    } finally {
      await r.cleanup()
    }
  })

  test("Save keeps a review approved elsewhere since the editor loaded", async ({ page, testMicrosite, withPremiumAccess }) => {
    const r = await pendingReview()
    try {
      await openWebsiteEditor(page)
      await expect(panelRow(page, r).getByText(r.quote)).toBeVisible({ timeout: 10000 })
      await page.getByPlaceholder('Reviews').fill(`Reviews ${Date.now()}`)

      // Approve it from Session Detail in a second tab while the editor
      // still holds its older, unsaved copy of the list.
      const other = await page.context().newPage()
      await other.goto(`/sessions/${r.session.id}`)
      await other.locator('#review').getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(other.locator('#review').getByText('Published')).toBeVisible({ timeout: 10000 })
      await other.close()

      const save = page.getByRole('button', { name: 'Save changes' })
      await save.click()
      await expect(save).toBeDisabled({ timeout: 10000 })

      const list = await getMicrositeTestimonials(sb, photographerId)
      expect(list.some(t => t.submission_id === r.submission.id)).toBe(true)
    } finally {
      await r.cleanup()
    }
  })
})

test.describe('Session Detail — approving in the Review card', () => {
  test('Approve switches the card to Published', async ({ page, testMicrosite, withPremiumAccess }) => {
    await ensureMicrosite(sb, photographerId)
    const r = await pendingReview()
    try {
      await page.goto(`/sessions/${r.session.id}#review`)
      const card = page.locator('#review')
      await expect(card.getByText(r.quote)).toBeVisible({ timeout: 10000 })
      await card.getByRole('button', { name: 'Approve', exact: true }).click()
      await expect(card.getByText('Published')).toBeVisible({ timeout: 10000 })

      const list = await getMicrositeTestimonials(sb, photographerId)
      expect(list[0].submission_id).toBe(r.submission.id)
    } finally {
      await r.cleanup()
    }
  })

  test('Reject switches the card to Not published', async ({ page, testMicrosite, withPremiumAccess }) => {
    await ensureMicrosite(sb, photographerId)
    const r = await pendingReview()
    try {
      await page.goto(`/sessions/${r.session.id}`)
      const card = page.locator('#review')
      await card.getByRole('button', { name: 'Reject', exact: true }).click()
      await card.getByRole('button', { name: 'Reject', exact: true }).click()
      await expect(card.getByText('Not published')).toBeVisible({ timeout: 10000 })
    } finally {
      await r.cleanup()
    }
  })

  test('an approved review no longer in the testimonials list shows Removed from website', async ({ page, testMicrosite, withPremiumAccess }) => {
    await ensureMicrosite(sb, photographerId)
    const made = await createReviewSession(sb, photographerId)
    try {
      const request = await createRequest(sb, photographerId, { session: made.session, client: made.client })
      await insertSubmission(sb, photographerId, request, {
        status: 'approved',
        publishedTestimonialId: crypto.randomUUID(), // not in microsites.testimonials
      })
      await page.goto(`/sessions/${made.session.id}`)
      await expect(page.locator('#review').getByText('Removed from website')).toBeVisible({ timeout: 10000 })
    } finally {
      await made.cleanup()
    }
  })
})
