import { test, expect } from '@playwright/test'

const SAMPLE_WATERMARK = 'tests/fixtures/test-images/watermark.png'

async function login(page) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
  await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL('/')
}

async function waitForAccountReady(page) {
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Watermarks' })).toBeVisible()
}

test.describe('Account — Watermarks', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/account')
    await waitForAccountReady(page)
  })

  test('shows account page with profile and watermark sections', async ({ page }) => {
    await expect(page.getByText('Profile')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Watermarks' })).toBeVisible()
    await expect(page.getByText('Upload watermark image')).toBeVisible()
  })

  test('saves display name on blur', async ({ page }) => {
    const input = page.getByPlaceholder('Your name or studio name')
    await input.fill('Test Studio')
    await input.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('upload button is present and file input accepts images', async ({ page }) => {
    // Verify the upload UI is functional — actual R2 upload requires
    // a live worker session and is tested manually / in staging.
    await expect(page.getByText('Upload watermark image')).toBeVisible()
    const fileInput = page.locator('input[aria-label="Upload watermark image"]')
    await expect(fileInput).toHaveAttribute('accept', 'image/*')
    await expect(page.getByText('PNG with transparency recommended')).toBeVisible()
  })

  test('watermark card shows opacity slider', async ({ page }) => {
    const count = await page.locator('input[aria-label="Watermark opacity"]').count()
    test.skip(count === 0, 'No watermarks uploaded yet')
    await expect(page.locator('input[aria-label="Watermark opacity"]').first()).toBeVisible()
  })

  test('watermark card shows position buttons', async ({ page }) => {
    const count = await page.locator('button[aria-label^="Position:"]').count()
    test.skip(count === 0, 'No watermarks uploaded yet')
    await expect(page.locator('button[aria-label="Position: Bottom Right"]').first()).toBeVisible()
    await expect(page.locator('button[aria-label="Position: Center"]').first()).toBeVisible()
  })

  test('can change watermark position', async ({ page }) => {
    const count = await page.locator('button[aria-label^="Position:"]').count()
    test.skip(count === 0, 'No watermarks uploaded yet')
    await page.locator('button[aria-label="Position: Center"]').first().click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('can change watermark label', async ({ page }) => {
    const count = await page.locator('input[aria-label="Watermark label"]').count()
    test.skip(count === 0, 'No watermarks uploaded yet')
    const labelInput = page.locator('input[aria-label="Watermark label"]').first()
    // Use a unique value each run so the change guard always fires
    const unique = `Studio Logo ${Date.now()}`
    await labelInput.fill(unique)
    await labelInput.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })
})

test.describe('Account — Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/account')
    await waitForAccountReady(page)
  })

  test('shows email address', async ({ page }) => {
    const email = process.env.PLAYWRIGHT_TEST_EMAIL ?? ''
    await expect(page.getByText(email).first()).toBeVisible()
  })

  test('display name input is present', async ({ page }) => {
    await expect(page.getByPlaceholder('Your name or studio name')).toBeVisible()
  })
})
