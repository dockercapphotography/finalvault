import { test, expect } from '@playwright/test'

// Click the visual toggle div (the pill) — it's a sibling of the sr-only checkbox inside <label>
function rowToggle(page, rowLabel) {
  return page.locator('.flex.items-center.justify-between')
    .filter({ hasText: rowLabel })
    .locator('label div.w-8')
    .first()
}

// Wait for settings to load: heading visible + title input populated
async function waitForSettingsReady(page) {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const titleInput = page.getByPlaceholder('e.g. Smith Wedding — June 2026')
  await expect(titleInput).not.toHaveValue('')
  await page.waitForTimeout(200)
}

test.describe('Gallery Settings', () => {
  let galleryId

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
    await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/galleries/new')
    await page.getByPlaceholder('e.g. Smith Wedding — June 2026').fill('Settings Test Gallery')
    await page.getByRole('button', { name: 'Create Gallery' }).click()

    await expect(page).toHaveURL(/\/galleries\/[0-9a-f-]{36}$/)
    galleryId = page.url().split('/').pop()
  })

  test('navigates to settings page', async ({ page }) => {
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

  test('switches to display tab and shows templates', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await expect(page.getByRole('button', { name: /Classic/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Minimal/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Editorial/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bold/ })).toBeVisible()
  })

  test('selecting a template saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await page.getByRole('button', { name: /Minimal/ }).click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })
})
