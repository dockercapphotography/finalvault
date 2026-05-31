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
  await sb().from('gallery_favorites').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
}

// Force all tests in this file to run serially — fixture gallery is shared
// and concurrent runs from other spec files cause viewer/favorites collisions.
test.describe.configure({ mode: 'serial' })

test.use({ contextOptions: { storageState: undefined } })

// ── Favorites with real images ────────────────────────────────────────────────

test.describe('Favorites — enabled', () => {
  test.afterEach(async () => {
    await cleanupViewerData(FIXTURE_GALLERY.id)
  })

  test('favorite heart buttons appear on image hover', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    await expect(firstImage.locator('button').first()).toBeVisible()
  })

  test('hearting an image fills the heart icon red', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    const heartBtn = firstImage.locator('button').first()
    const insertDone = page.waitForResponse(r =>
      r.url().includes('gallery_favorites') && r.request().method() === 'POST'
    )
    await heartBtn.click()
    await insertDone
    await expect(heartBtn.locator('svg')).toHaveAttribute('fill', '#ef4444')
  })

  test('unhearting an image removes the fill', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    const heartBtn = firstImage.locator('button').first()

    // Heart it
    const insertDone = page.waitForResponse(r =>
      r.url().includes('gallery_favorites') && r.request().method() === 'POST'
    )
    await heartBtn.click()
    await insertDone
    await expect(heartBtn.locator('svg')).toHaveAttribute('fill', '#ef4444')

    // Wait for React state to reflect the heart (fill attribute set)
    await expect(heartBtn.locator('svg')).toHaveAttribute('fill', '#ef4444', { timeout: 5000 })

    // Unheart it — now React state has favorites set so second click will DELETE
    await firstImage.hover()
    const deleteDone = page.waitForResponse(r =>
      r.url().includes('gallery_favorites') && r.request().method() === 'DELETE'
    )
    await heartBtn.click()
    await deleteDone
    await firstImage.hover()
    await expect(heartBtn.locator('svg')).toHaveAttribute('fill', 'none')
  })

  test('favoriting is reflected in DB', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    const insertDone = page.waitForResponse(r =>
      r.url().includes('gallery_favorites') && r.request().method() === 'POST'
    )
    await firstImage.locator('button').first().click()
    await insertDone
    await page.waitForTimeout(300)
    const { data } = await sb().from('gallery_favorites')
      .select('id')
      .eq('gallery_id', FIXTURE_GALLERY.id)
    expect(data.length).toBeGreaterThan(0)
  })

  test('favoriting logs activity', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await page.waitForLoadState('networkidle')
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    const insertDone = page.waitForResponse(r =>
      r.url().includes('gallery_favorites') && r.request().method() === 'POST'
    )
    await firstImage.locator('button').first().click()
    await insertDone
    await page.waitForTimeout(1500)
    const { data } = await sb().from('gallery_activity_log')
      .select('action')
      .eq('gallery_id', FIXTURE_GALLERY.id)
      .eq('action', 'favorite')
    expect(data.length).toBeGreaterThan(0)
  })
})

// ── Favorites disabled ────────────────────────────────────────────────────────

test.describe('Favorites — disabled', () => {
  let gallery

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    const shareToken = `test-fav-${crypto.randomUUID().slice(0, 8)}`
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'No Favorites Gallery',
      share_token: shareToken,
      is_active: true,
      allow_downloads: false,
      allow_favorites: false,
      allow_comments: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    gallery = data
  })

  test.afterEach(async () => {
    await sb().from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb().from('galleries').delete().eq('id', gallery.id)
  })

  test('gallery loads successfully when favorites disabled', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await expect(page.getByText('No Favorites Gallery').first()).toBeVisible()
  })
})
