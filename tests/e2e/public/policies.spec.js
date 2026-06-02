import { test, expect } from '@playwright/test'

/**
 * Public Policy Pages — Privacy Policy & Terms of Service
 *
 * Both routes are public (no auth required).
 */

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

test.describe('Policy pages — unauthenticated access', () => {
  test('/privacy loads without auth and shows Privacy Policy heading', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
  })

  test('/terms loads without auth and shows Terms of Service heading', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Login page footer links
// ---------------------------------------------------------------------------

test.describe('Policy links — login page footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
  })

  test('Privacy Policy link on login page navigates to /privacy', async ({ page }) => {
    await page.getByRole('link', { name: /privacy policy/i }).first().click()
    await expect(page).toHaveURL(/\/privacy/)
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
  })

  test('Terms of Service link on login page navigates to /terms', async ({ page }) => {
    await page.getByRole('link', { name: /terms of service/i }).first().click()
    await expect(page).toHaveURL(/\/terms/)
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// App footer links (authenticated, desktop only)
// The app footer uses `hidden md:flex` — it is not rendered on mobile viewports.
// ---------------------------------------------------------------------------

test.describe('Policy links — app footer', () => {
  test.use({
    storageState: 'tests/.auth/photographer.json',
    viewport: { width: 1280, height: 800 },
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('Privacy Policy link in app footer navigates to /privacy', async ({ page }) => {
    await page.getByTestId('app-footer').getByRole('link', { name: /privacy policy/i }).click()
    await expect(page).toHaveURL(/\/privacy/)
    await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
  })

  test('Terms of Service link in app footer navigates to /terms', async ({ page }) => {
    await page.getByTestId('app-footer').getByRole('link', { name: /terms of service/i }).click()
    await expect(page).toHaveURL(/\/terms/)
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible()
  })
})
