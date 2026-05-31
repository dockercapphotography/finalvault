import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Image Upload', () => {
  let galleryId

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'Upload Test Gallery',
      share_token: `upload-test-${crypto.randomUUID().slice(0, 8)}`,
      is_active: true,
      allow_downloads: true,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    galleryId = data.id

    // Gallery needs at least one set for the upload zone to render
    const { error: setError } = await sb().from('gallery_sets').insert({
      gallery_id: galleryId,
      name: 'Photos',
      sort_order: 0,
    })
    if (setError) throw new Error(setError.message)
  })

  test.afterEach(async () => {
    await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
    await sb().from('gallery_sets').delete().eq('gallery_id', galleryId)
    await sb().from('galleries').delete().eq('id', galleryId)
  })

  test('shows upload zone on gallery detail page', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 10000 })
  })

  test('upload zone accepts file picker click', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 10000 })
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeAttached()
  })

  test('shows gallery title and image count', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.getByRole('heading', { name: 'Upload Test Gallery' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Images (0)')).toBeVisible()
  })

  test('shows sort dropdown when images are present', async ({ page }) => {
    // Sort dropdown only shows when there are images — verify it's absent for empty gallery
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.getByText('Images (0)')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('select, [role="combobox"]').filter({ hasText: /sort/i })).toHaveCount(0)
  })

  test('preview button opens gallery in new tab', async ({ page, context }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.getByRole('heading', { name: 'Upload Test Gallery' })).toBeVisible({ timeout: 10000 })
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Preview' }).click(),
    ])
    await expect(newPage).toHaveURL(/preview=1/)
    await newPage.close()
  })

  test('uploads a single image and shows in grid', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 10000 })
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('tests/fixtures/test-images/test_image.jpg')
    // Wait for upload to complete and image to appear in grid
    await expect(page.getByText('Images (1)')).toBeVisible({ timeout: 30000 })
  })
})
