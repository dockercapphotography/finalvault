import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Image Upload', () => {
  let galleryUrl

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
    await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')

    // Create a test gallery
    await page.goto('/galleries/new')
    await page.getByPlaceholder('e.g. Smith Wedding — June 2026').fill('Upload Test Gallery')
    await page.getByRole('button', { name: 'Create Gallery' }).click()
    await expect(page).toHaveURL(/\/galleries\/[a-z0-9-]+$/)
    galleryUrl = page.url()
  })

  test('shows upload zone on gallery detail page', async ({ page }) => {
    await expect(page.getByText('Drop images here or click to browse')).toBeVisible()
  })

  test('upload zone accepts file picker click', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeAttached()
  })

  test.skip('uploads a single image and shows in grid', async ({ page }) => {
    // Requires a test image fixture — implement when fixtures are set up
  })

  test.skip('uploads multiple images concurrently', async ({ page }) => {
    // Requires test image fixtures
  })
})
