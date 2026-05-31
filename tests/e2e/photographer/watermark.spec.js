import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/.auth/photographer.json' })

async function goToWatermarksTab(page) {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  // Click the Watermarks tab
  await page.getByRole('button', { name: 'Watermarks' }).click()
  await expect(page.getByText('Upload watermark image')).toBeVisible()
}

async function goToProfileTab(page) {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  // Profile is the default tab — wait for content to load
  await page.getByRole('button', { name: 'Profile' }).click()
  await page.waitForLoadState('networkidle')
}

test.describe('Account — Watermarks', () => {
  test('account page loads and shows tabs', async ({ page }) => {
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Watermarks' })).toBeVisible()
  })

  test('watermarks tab shows upload button', async ({ page }) => {
    await goToWatermarksTab(page)
    await expect(page.getByText('Upload watermark image')).toBeVisible()
    await expect(page.getByText('PNG or SVG with transparency recommended')).toBeVisible()
  })

  test('upload button file input accepts images', async ({ page }) => {
    await goToWatermarksTab(page)
    const fileInput = page.locator('input[type="file"][accept="image/*"]')
    await expect(fileInput).toBeAttached()
  })

  test('watermark card shows opacity slider', async ({ page }) => {
    await goToWatermarksTab(page)
    // Opacity label is visible in the watermark card
    await expect(page.getByText('Opacity').first()).toBeVisible()
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })

  test('watermark card shows position buttons', async ({ page }) => {
    await goToWatermarksTab(page)
    await expect(page.getByText('Position').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Center' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Top Left' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bottom Right' })).toBeVisible()
  })

  test('can change watermark position', async ({ page }) => {
    await goToWatermarksTab(page)
    await page.getByRole('button', { name: 'Bottom Right' }).click()
    await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 10000 })
    // Reset back to Center
    await page.getByRole('button', { name: 'Center' }).click()
  })

  test('watermark card shows scale slider', async ({ page }) => {
    await goToWatermarksTab(page)
    await expect(page.getByText('Scale').first()).toBeVisible()
    await expect(page.locator('input[type="range"]').nth(1)).toBeVisible()
  })
})

test.describe('Account — Profile', () => {
  test('shows email address', async ({ page }) => {
    await goToProfileTab(page)
    const email = process.env.PLAYWRIGHT_TEST_EMAIL ?? ''
    await expect(page.getByText(email).first()).toBeVisible()
  })

  test('display name input is present', async ({ page }) => {
    await goToProfileTab(page)
    await expect(page.getByPlaceholder('Your name')).toBeVisible()
  })

  test('saves display name on blur', async ({ page }) => {
    await goToProfileTab(page)
    const input = page.getByPlaceholder('Your name')
    await input.fill('Test Studio')
    await input.blur()
    await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 10000 })
  })

  test('can upload and save avatar photo', async ({ page }) => {
    await goToProfileTab(page)
    const avatarInput = page.locator('input[type="file"][accept*="image"]').first()
    await expect(avatarInput).toBeAttached()
    await avatarInput.setInputFiles('tests/fixtures/test-images/test_image.jpg')
    // Crop modal opens
    await expect(page.getByText('Crop profile photo')).toBeVisible({ timeout: 5000 })
    // Click Save photo to confirm
    await page.getByRole('button', { name: 'Save photo' }).click()
    await expect(page.getByText('Crop profile photo')).not.toBeVisible({ timeout: 10000 })
  })

  test('shows storage meter', async ({ page }) => {
    await goToProfileTab(page)
    // Storage section exists with used/total display
    await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible()
  })
})
