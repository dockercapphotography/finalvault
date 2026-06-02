import { test, expect } from '@playwright/test'

/**
 * Account Tab URL Routing
 *
 * Verifies that the ?tab= query param lands on the correct tab.
 * Tabs use role="button" (matching the existing watermark.spec.js pattern).
 */

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Account tab routing via ?tab= param', () => {
  test('/account?tab=watermarks lands on Watermarks tab', async ({ page }) => {
    await page.goto('/account?tab=watermarks')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })

    // Watermarks tab button should appear active
    const watermarksBtn = page.getByRole('button', { name: 'Watermarks' })
    await expect(watermarksBtn).toBeVisible()

    // Watermarks tab content should be visible
    await expect(page.getByText('Upload watermark image')).toBeVisible()
  })

  test('/account?tab=profile lands on Profile tab', async ({ page }) => {
    await page.goto('/account?tab=profile')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })

    const profileBtn = page.getByRole('button', { name: 'Profile' })
    await expect(profileBtn).toBeVisible()

    // Profile tab content — email field is always present
    await expect(page.getByPlaceholder('Your name')).toBeVisible()
  })
})
