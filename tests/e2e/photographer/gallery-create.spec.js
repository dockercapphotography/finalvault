import { test, expect } from '@playwright/test'

test.describe('Gallery Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
    await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')
  })

  test('navigates to new gallery form', async ({ page }) => {
    await page.getByRole('button', { name: 'New Gallery' }).click()
    await expect(page).toHaveURL('/galleries/new')
    await expect(page.getByRole('heading', { name: 'New Gallery' })).toBeVisible()
  })

  test('shows validation error when title is empty', async ({ page }) => {
    await page.goto('/galleries/new')
    await expect(page.getByRole('button', { name: 'Create Gallery' })).toBeDisabled()
  })

  test('creates a gallery and redirects to detail page', async ({ page }) => {
    await page.goto('/galleries/new')
    await page.getByPlaceholder('e.g. Smith Wedding — June 2026').fill('Playwright Test Gallery')
    await page.getByPlaceholder('e.g. Sarah & James Smith').fill('Test Client')
    await page.getByRole('button', { name: 'Create Gallery' }).click()
    await expect(page).toHaveURL(/\/galleries\/[a-z0-9-]+$/)
    await expect(page.getByText('Playwright Test Gallery')).toBeVisible()
  })

  test('cancel returns to dashboard', async ({ page }) => {
    await page.goto('/galleries/new')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL('/')
  })
})
