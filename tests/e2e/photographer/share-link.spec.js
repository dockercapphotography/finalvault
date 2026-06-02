import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })
test.describe.configure({ mode: 'serial' })

test.describe('Share Link', () => {
  let galleryId

  async function goToGallery(page) {
    // Retry once in case of transient network issue
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(`/galleries/${galleryId}`)
      await page.waitForLoadState('domcontentloaded')
      const heading = page.getByRole('heading', { name: /Share Link Test Gallery/ })
      try {
        await expect(heading).toBeVisible({ timeout: 25000 })
        return
      } catch {
        if (attempt === 2) throw new Error('Gallery heading not visible after 3 attempts')
      }
    }
  }

  test.beforeAll(async () => {
    const { data: { users } } = await sb().auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    // Use a unique title per worker run to avoid cross-browser beforeAll cleanup conflicts
    const suffix = crypto.randomUUID().slice(0, 8)
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: user.id,
      title: `Share Link Test Gallery ${suffix}`,
      client_name: 'Test Client',
      share_token: crypto.randomUUID().replace(/-/g, ''),
      is_active: true,
      allow_downloads: true,
    }).select().single()
    if (error) throw new Error(`Failed to create share-link gallery: ${error.message}`)
    galleryId = data.id
  })

  test.afterAll(async () => {
    await sb().from('galleries').delete().eq('id', galleryId)
  })

  test('Share button is visible on gallery detail page', async ({ page }) => {
    await goToGallery(page)
    await expect(page.getByRole('button', { name: /Share/ })).toBeVisible()
  })

  test('Share dropdown shows email, link, and QR options', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Share by email')).toBeVisible()
    await expect(page.getByText('Get direct link')).toBeVisible()
    await expect(page.getByText('Get QR code')).toBeVisible()
  })

  test('Get direct link modal shows gallery URL', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Get direct link').click()
    await expect(page.getByText('Get Direct Link')).toBeVisible()
    await expect(page.getByText(/localhost.*\/g\//)).toBeVisible()
  })

  test('Copy button copies gallery URL to clipboard', async ({ page, context, browserName }) => {
    if (browserName !== 'chromium') test.skip()
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Get direct link').click()
    await expect(page.getByText('Get Direct Link')).toBeVisible()
    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByText('Copied')).toBeVisible()
    if (browserName === 'chromium') {
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      expect(clipboard).toMatch(/\/g\/[a-f0-9]+/)
    }
  })

  test('Direct link modal closes on backdrop click', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Get direct link').click()
    await expect(page.getByText('Get Direct Link')).toBeVisible()
    await page.mouse.click(10, 10)
    await expect(page.getByText('Get Direct Link')).not.toBeVisible()
  })

  test('QR code modal shows canvas and download button', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Get QR code').click()
    await expect(page.getByText('QR Code')).toBeVisible()
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible()
  })

  test('Email composer modal shows recipient and subject fields', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Share by email').click()
    await expect(page.getByText('Share by Email')).toBeVisible()
    await expect(page.getByPlaceholder(/client@email/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  })

  test('Email send button disabled when no recipients', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Share by email').click()
    const sendBtn = page.getByRole('button', { name: 'Send' })
    await expect(sendBtn).toBeDisabled()
  })

  test('direct link modal URL contains the gallery share token', async ({ page }) => {
    await goToGallery(page)
    await page.getByRole('button', { name: /Share/ }).click()
    await page.getByText('Get direct link').click()
    await expect(page.getByText('Get Direct Link')).toBeVisible()
    // The URL shown should contain /g/ and a share token
    const urlText = await page.locator('.font-mono').textContent()
    expect(urlText).toMatch(/\/g\/[a-f0-9]+/)
  })
})
