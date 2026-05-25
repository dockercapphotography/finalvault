import { test, expect } from '@playwright/test'

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
    await expect(page).toHaveURL(/\/galleries\/[a-z0-9-]+$/)
    galleryId = page.url().split('/').pop()
  })

  test('navigates to settings page', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page).toHaveURL(`/galleries/${galleryId}/settings`)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('shows all tabs', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Access' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sharing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Display' })).toBeVisible()
  })

  test('saves general settings', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await page.getByLabel('Gallery title').fill('Updated Title')
    await page.getByRole('button', { name: 'Save Changes' }).first().click()
    await expect(page.getByText('Settings saved')).toBeVisible()
  })

  test('toggles password protection on access tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await page.getByRole('button', { name: 'Access' }).click()
    await page.locator('label').filter({ hasText: 'Require password' }).locator('div').first().click()
    await expect(page.getByPlaceholder(/Set a new password/)).toBeVisible()
  })

  test('selects template on display tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await page.getByRole('button', { name: 'Display' }).click()
    await page.getByRole('button', { name: /Minimal/ }).click()
    await page.getByRole('button', { name: 'Save Changes' }).first().click()
    await expect(page.getByText('Settings saved')).toBeVisible()
  })
})
