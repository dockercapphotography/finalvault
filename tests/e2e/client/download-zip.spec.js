import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY, enterGalleryAsClient } from '../../fixtures/fixtures.js'

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

async function cleanupViewerData(galleryId) {
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
}

// Scroll just enough to bring the sticky header into view
// The sticky header sits at the bottom edge of the hero (top: ~720px in a 720px viewport)
// Scrolling by ~50px brings it to top: ~670px which is in view
async function scrollToGrid(page) {
  // Scroll past the hero image to trigger the sticky header
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }))
  await page.waitForTimeout(500)
}

// Get the header download button from the sticky header
async function clickHeaderDownload(page) {
  const stickyHeader = page.locator('div.sticky')
  await stickyHeader.waitFor({ state: 'visible', timeout: 10000 })
  // Download button is the last button in the sticky header (rightmost).
  await stickyHeader.getByRole('button').last().click()
}

async function createGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const shareToken = `test-zip-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'ZIP Test Gallery',
    share_token: shareToken,
    is_active: true,
    allow_downloads: true,
    download_watermarked: true,
    allow_hires_download: false,
    allow_favorites: false,
    allow_comments: false,
    require_download_pin: false,
    show_guide: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

test.describe.configure({ mode: 'serial' })
test.use({ contextOptions: { storageState: undefined } })

// ── ZIP download ──────────────────────────────────────────────────────────────

test.describe('Download ZIP — enabled', () => {
  test.afterEach(async () => {
    await cleanupViewerData(FIXTURE_GALLERY.id)
  })

  test('download button is visible in the sticky header', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await scrollToGrid(page)
    // The sticky header contains the gallery title and a download button
    // Find it by the title text, then look for a sibling button
    await expect(page.getByText('Fixture Gallery').first()).toBeVisible()
    // The sticky header h1 has class text-sm (hero h1 has text-3xl)
    // Find the small title and verify its parent has a download button
    const smallTitle = page.locator('h1.text-sm, h1[class*="text-sm"]')
    await expect(smallTitle).toBeVisible()
    // Its sibling/parent contains the download button
    const headerContainer = page.locator('div').filter({ has: smallTitle }).filter({ has: page.locator('button') }).last()
    await expect(headerContainer.locator('button').last()).toBeVisible()
  })

  test('clicking header download shows web size option', async ({ page, browserName, isMobile }) => {
    // iOS Safari uses the native share sheet instead of a download event
    test.skip(isMobile && browserName === 'webkit', 'iOS uses native share sheet, no download event')
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await scrollToGrid(page)
    // Click the download button in the sticky header area
    await clickHeaderDownload(page)
    // With only web size enabled (download_watermarked: true, allow_hires: false)
    // clicking triggers download directly — wait for download event
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    // If a dropdown appeared, click Web Size
    const webSizeBtn = page.getByText('Web Size')
    if (await webSizeBtn.isVisible()) {
      await webSizeBtn.click()
    }
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/i)
  })

  test('ZIP progress modal appears during download', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await scrollToGrid(page)
    await scrollToGrid(page)
    const stickyHdr = page.locator('div.sticky')
    await stickyHdr.waitFor({ state: 'visible', timeout: 10000 })
    await stickyHdr.getByRole('button').last().click()
    const webSizeBtn = page.getByText('Web Size')
    if (await webSizeBtn.isVisible()) await webSizeBtn.click()
    // Progress modal should appear
    await expect(page.getByText(/Processing photos|Preparing your download/)).toBeVisible({ timeout: 5000 })
  })
})

// ── PIN gate ──────────────────────────────────────────────────────────────────

test.describe('Download ZIP — PIN gate', () => {
  // We need a gallery with images AND a PIN. We'll create a gallery and
  // point it at the fixture images by inserting gallery_images rows.
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery({
      require_download_pin: true,
      plain_download_pin: '7391',
    })
    // Copy fixture image rows into this gallery so downloads can be triggered
    const photographerId = await getPhotographerId()
    await sb().from('gallery_images').insert(
      FIXTURE_GALLERY.images.map(img => ({
        id: crypto.randomUUID(),
        gallery_id: gallery.id,
        photographer_id: photographerId,
        file_name: img.fileName,
        preview_r2_key: img.previewR2Key,
        original_r2_key: img.previewR2Key.replace('/preview/', '/original/').replace('.webp', '.jpg'),
        file_size: 1000000,
        preview_size: 200000,
        updated_at: new Date().toISOString(),
      }))
    )
  })

  test.afterEach(async () => {
    await sb().from('gallery_images').delete().eq('gallery_id', gallery.id)
    await sb().from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb().from('galleries').delete().eq('id', gallery.id)
  })

  test('PIN gate appears when download requires PIN', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await scrollToGrid(page)
    await scrollToGrid(page)
    const stickyHdr = page.locator('div.sticky')
    await stickyHdr.waitFor({ state: 'visible', timeout: 10000 })
    await stickyHdr.getByRole('button').last().click()
    const webSizeBtn = page.getByText('Web Size')
    if (await webSizeBtn.isVisible()) await webSizeBtn.click()
    await expect(page.getByText('Download PIN required')).toBeVisible()
    await expect(page.locator('input[inputmode="numeric"]')).toBeVisible()
  })

  test('wrong PIN shows error message', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await scrollToGrid(page)
    await scrollToGrid(page)
    const stickyHdr = page.locator('div.sticky')
    await stickyHdr.waitFor({ state: 'visible', timeout: 10000 })
    await stickyHdr.getByRole('button').last().click()
    const webSizeBtn = page.getByText('Web Size')
    if (await webSizeBtn.isVisible()) await webSizeBtn.click()
    await page.locator('input[inputmode="numeric"]').fill('0000')
    await page.getByRole('button', { name: 'Download' }).click()
    await expect(page.getByText('Incorrect PIN')).toBeVisible()
  })

  test('correct PIN dismisses gate and starts download', async ({ page, browserName, isMobile }) => {
    test.skip(isMobile && browserName === 'webkit', 'iOS uses native share sheet, no download event')
    await enterGalleryAsClient(page, gallery.share_token)
    await scrollToGrid(page)
    await scrollToGrid(page)
    const stickyHdr = page.locator('div.sticky')
    await stickyHdr.waitFor({ state: 'visible', timeout: 10000 })
    await stickyHdr.getByRole('button').last().click()
    const webSizeBtn = page.getByText('Web Size')
    if (await webSizeBtn.isVisible()) await webSizeBtn.click()
    await page.locator('input[inputmode="numeric"]').fill('7391')
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: 'Download' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/i)
  })
})
