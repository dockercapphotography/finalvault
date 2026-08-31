import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite editor — mobile bottom navigation (Content/Design/Preview),
 * added this session to replace the desktop top-pills-plus-separate-
 * preview-pane split, which didn't fit a narrow viewport at all.
 */

const MOBILE = { width: 375, height: 812 }

test.describe('Microsite editor — mobile navigation', () => {
  test('bottom bar shows Content, Design, Preview; top pills are hidden', async ({ page, testMicrosite }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByTestId('mobile-nav-content')).toBeVisible()
    await expect(page.getByTestId('mobile-nav-design')).toBeVisible()
    await expect(page.getByTestId('mobile-nav-preview')).toBeVisible()
    await expect(page.getByTestId('desktop-tabs')).toBeHidden()
  })

  test('tapping Design switches the panel on mobile', async ({ page, testMicrosite }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByPlaceholder('Reviews')).toBeVisible()
    await page.getByTestId('mobile-nav-design').click()
    await expect(page.getByPlaceholder('Reviews')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible()
  })

  test('Preview opens the overlay, and Content/Design still work while it is open', async ({ page, testMicrosite }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await page.getByTestId('mobile-nav-preview').click()
    const overlay = page.getByTestId('mobile-preview-overlay')
    await expect(overlay).toBeVisible({ timeout: 10000 })

    // The bottom bar must stay clickable while the overlay is open --
    // this was the actual bug reported and fixed earlier this session
    // (the overlay's z-index was blocking clicks to the bar beneath it).
    await page.getByTestId('mobile-nav-content').click()
    await expect(overlay).not.toBeVisible()
    await expect(page.getByPlaceholder('Reviews')).toBeVisible()
  })
})
