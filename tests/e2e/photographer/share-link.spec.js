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

let galleryId

test.beforeAll(async () => {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  const { data } = await sb().from('galleries').insert({
    photographer_id: user.id,
    title: 'Share Link Test Gallery',
    client_name: 'Test Client',
    is_active: true,
    allow_downloads: true,
  }).select().single()
  galleryId = data.id
})

test.afterAll(async () => {
  await sb().from('galleries').delete().eq('id', galleryId)
})

async function goToGallery(page) {
  await page.goto(`/galleries/${galleryId}`)
  await expect(page.getByRole('heading', { name: 'Share Link Test Gallery' })).toBeVisible({ timeout: 10000 })
}

test.describe('Share Link', () => {
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
    // clipboard-read only supported in chromium
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    }
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
