import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

// Click the visual toggle div (the pill)
function rowToggle(page, rowLabel) {
  return page.locator('.flex.items-center.justify-between')
    .filter({ hasText: rowLabel })
    .locator('label div.w-8')
    .first()
}

async function waitForSettingsReady(page) {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const titleInput = page.getByPlaceholder('e.g. Smith Wedding — June 2026')
  await expect(titleInput).not.toHaveValue('')
  await page.waitForTimeout(200)
}

test.describe('Gallery Settings', () => {
  let galleryId

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'Settings Test Gallery',
      share_token: `settings-test-${crypto.randomUUID().slice(0, 8)}`,
      is_active: true,
      allow_downloads: true,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    galleryId = data.id
  })

  test.afterEach(async () => {
    await sb().from('galleries').delete().eq('id', galleryId)
  })

  test('navigates to settings page', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(`/galleries/${galleryId}/settings`)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('shows all tabs', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Access' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sharing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Display' })).toBeVisible()
  })

  test('saves gallery title on blur', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    const titleInput = page.getByPlaceholder('e.g. Smith Wedding — June 2026')
    await titleInput.fill('Updated Title')
    await titleInput.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('saves client name on blur', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    const clientInput = page.getByPlaceholder('e.g. Sarah & James')
    await clientInput.fill('Jane Doe')
    await clientInput.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggles gallery active status', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await rowToggle(page, 'Gallery active').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to access tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await expect(page.getByText('Password Protection')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Download PIN' })).toBeVisible()
  })

  test('enabling password protection reveals password field', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await rowToggle(page, 'Require password').click()
    await expect(page.getByText('Gallery password')).toBeVisible()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('enabling download PIN reveals PIN field', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await rowToggle(page, 'Require download PIN').click()
    await expect(page.getByRole('heading', { name: 'Download PIN' })).toBeVisible()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to sharing tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
    await expect(page.getByText('Client Interactions')).toBeVisible()
  })

  test('toggling allow downloads saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow downloads').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggling allow favorites saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow favorites').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggling allow comments saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow comments').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to display tab and shows color themes', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await expect(page.getByText('Color Theme')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Slate' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dusk' })).toBeVisible()
  })

  test('selecting a color theme saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('display tab shows grid options', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await expect(page.getByRole('heading', { name: 'Grid' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regular' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Large 4 per row' })).toBeVisible()
  })

  test('danger zone shows delete button', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Danger Zone' }).click()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('delete gallery requires confirmation', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Danger Zone' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Are you sure?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Yes, delete permanently/ })).toBeVisible()
  })
})
