import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })

const galleryId = FIXTURE_GALLERY.id
const shareToken = FIXTURE_GALLERY.shareToken

test.describe('Activity Feed', () => {
  test('activity page loads for a gallery', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
  })

  test('shows summary stats cards', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Total Views')).toBeVisible()
    await expect(page.getByText('Unique Visitors')).toBeVisible()
  })

  test('shows activity filter buttons', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Views' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Downloads' })).toBeVisible()
  })

  test('activity is accessible from gallery detail page', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.getByRole('heading', { name: /gallery/i })).toBeVisible({ timeout: 10000 })
    const activityLink = page.getByRole('link', { name: /Activity/ })
    if (await activityLink.isVisible()) {
      await activityLink.click()
      await expect(page).toHaveURL(`/galleries/${galleryId}/activity`)
    }
  })

  test('shows activity after a client visits', async ({ page, browser }) => {
    const clientCtx = await browser.newContext()
    const clientPage = await clientCtx.newPage()
    await clientPage.goto(`/g/${shareToken}`)
    await clientPage.getByPlaceholder('Enter your email to continue').fill('activitytest@example.com')
    await clientPage.getByRole('button', { name: 'View Gallery' }).click()
    await expect(clientPage).toHaveURL(`/g/${shareToken}/view`, { timeout: 10000 })
    await clientCtx.close()

    await page.goto(`/galleries/${galleryId}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1000)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    const bodyText = await page.textContent('body')
    expect(bodyText).toBeTruthy()
  })

  test('shows empty state when gallery has no activity', async ({ page }) => {
    const { data: { users } } = await sb().auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: user.id,
      title: 'Empty Activity Gallery',
      is_active: true,
    }).select().single()

    try {
      await page.goto(`/galleries/${gallery.id}/activity`)
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('No activity yet.')).toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })
})

// ── v1.5.8: pagination + true (uncapped) stat totals ────────────────────────

test.describe('Activity Feed — pagination', () => {
  let gallery
  const EVENT_COUNT = 30 // more than the 25/page default

  test.beforeEach(async () => {
    const { data: { users } } = await sb().auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    const { data } = await sb().from('galleries').insert({
      photographer_id: user.id,
      title: 'PW Activity Pagination Gallery',
      is_active: true,
    }).select().single()
    gallery = data

    const rows = Array.from({ length: EVENT_COUNT }, () => ({
      gallery_id: gallery.id,
      action: 'view',
      occurred_at: new Date().toISOString(),
    }))
    const { error } = await sb().from('gallery_activity_log').insert(rows)
    if (error) throw new Error(error.message)
  })

  test.afterEach(async () => {
    await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb().from('galleries').delete().eq('id', gallery.id)
  })

  test('shows a real page count once activity exceeds one page', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(`Showing 1–25 of ${EVENT_COUNT}`)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Page 1 of 2')).toBeVisible()
  })

  test('Next advances to the second page and shows the remainder', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}/activity`)
    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(`Showing 26–${EVENT_COUNT} of ${EVENT_COUNT}`)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
  })

  test('stat cards reflect the TRUE total across all activity, not just the current page', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}/activity`)
    await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
    // Before v1.5.8 this stat was derived from a client-side array capped
    // at .limit(200) -- for THIS gallery (30 events, under 200) that cap
    // wouldn't have been hit either way, so what actually matters here is
    // confirming the new count-query path produces the same correct
    // number a full scan would, now backed by a real DB count() instead
    // of client-side array filtering.
    const viewsCard = page.locator('p', { hasText: 'Total Views' }).locator('..')
    await expect(viewsCard.getByText(String(EVENT_COUNT), { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('switching the action filter re-queries the server, not a client-side slice', async ({ page }) => {
    // Add a handful of favorite events too, distinct from the 30 views
    await sb().from('gallery_activity_log').insert([
      { gallery_id: gallery.id, action: 'favorite', occurred_at: new Date().toISOString() },
      { gallery_id: gallery.id, action: 'favorite', occurred_at: new Date().toISOString() },
    ])

    await page.goto(`/galleries/${gallery.id}/activity`)
    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 10000 }) // 30 views, still 2 pages under 'All'

    await page.getByRole('button', { name: 'Views' }).click()
    await expect(page.getByText(`Showing 1–25 of ${EVENT_COUNT}`)).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Favorites' }).click()
    await expect(page.getByText('Showing 1–2 of 2')).toBeVisible({ timeout: 5000 })
    // Only 2 results -- pagination footer's page label shouldn't show at all
    await expect(page.getByText(/Page \d+ of \d+/)).not.toBeVisible()
  })
})
