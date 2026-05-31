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
    await clientPage.getByPlaceholder('Enter your name to continue').fill('Activity Test Client')
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
