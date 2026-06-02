import { test, expect } from '@playwright/test'

/**
 * Desktop Footer
 *
 * PageWrapper renders a `hidden md:flex` footer — visible at ≥768px,
 * hidden below that breakpoint.
 */

test.use({ storageState: 'tests/.auth/photographer.json' })

const DESKTOP = { width: 1280, height: 800 }
const MOBILE  = { width: 375,  height: 812 }

test.describe('Desktop footer', () => {
  test('footer is visible on desktop', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('app-footer')).toBeVisible()
  })

  test('footer is hidden on mobile viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('app-footer')).toBeHidden()
  })

  test('footer shows copyright text', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('app-footer')).toContainText(/©\s*\d{4}/)
  })

  test('footer contains Privacy Policy link', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByTestId('app-footer').getByRole('link', { name: /privacy policy/i })
    ).toBeVisible()
  })

  test('footer contains Terms of Service link', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByTestId('app-footer').getByRole('link', { name: /terms of service/i })
    ).toBeVisible()
  })

  test('footer is visible on galleries page', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/galleries')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('app-footer')).toBeVisible()
  })
})
