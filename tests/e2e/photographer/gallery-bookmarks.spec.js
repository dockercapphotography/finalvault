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
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function createTestGalleryWithSets(photographerId) {
  const uid = crypto.randomUUID().slice(0, 8)
  const { data: gallery, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `Bookmark Test Gallery ${uid}`,
    share_token: `bookmark-test-${uid}`,
    is_active: true,
    allow_downloads: true,
    allow_favorites: true,
    allow_comments: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)

  const { data: setA, error: setAError } = await sb().from('gallery_sets').insert({
    gallery_id: gallery.id, name: 'Previews', sort_order: 0,
  }).select().single()
  if (setAError) throw new Error(setAError.message)

  const { data: setB, error: setBError } = await sb().from('gallery_sets').insert({
    gallery_id: gallery.id, name: 'Edited', sort_order: 1,
  }).select().single()
  if (setBError) throw new Error(setBError.message)

  return { gallery, setA, setB }
}

async function createTestImage(photographerId, galleryId, setId, overrides = {}) {
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('gallery_images').insert({
    gallery_id: galleryId,
    photographer_id: photographerId,
    set_id: setId,
    original_r2_key: `photographers/${photographerId}/test/${uid}_original.jpg`,
    preview_r2_key: `photographers/${photographerId}/test/${uid}_preview.webp`,
    file_name: `test-${uid}.jpg`,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestGallery(galleryId) {
  const { data: imgs } = await sb().from('gallery_images').select('id').eq('gallery_id', galleryId)
  const imageIds = imgs?.map(r => r.id) || []
  if (imageIds.length) {
    await sb().from('pinned_images').delete().in('image_id', imageIds)
  }
  await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_sets').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

// ── Bookmark state sync across set switches ────────────────────────────────

test.describe('Gallery image bookmarks — state sync', () => {
  let photographerId, gallery, setA, setB, image

  test.beforeEach(async () => {
    photographerId = await getPhotographerId()
    const created = await createTestGalleryWithSets(photographerId)
    gallery = created.gallery
    setA = created.setA
    setB = created.setB
    image = await createTestImage(photographerId, gallery.id, setA.id)
  })

  test.afterEach(async () => {
    await deleteTestGallery(gallery.id)
  })

  test('bookmark icon reflects bookmarked state after switching sets and back', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}`)
    await expect(page.getByRole('button', { name: setA.name })).toBeVisible({ timeout: 15000 })

    const bookmarkBtn = page.getByRole('button', { name: 'Bookmark image' }).first()
    await expect(bookmarkBtn).toBeVisible({ timeout: 10000 })
    await bookmarkBtn.click()
    await expect(page.getByRole('button', { name: 'Remove bookmark' }).first()).toBeVisible({ timeout: 5000 })

    // Switch to the other (empty) set, then back
    await page.getByRole('button', { name: setB.name }).click()
    await page.getByRole('button', { name: setA.name }).click()

    // Bookmark state should still show as bookmarked, not reset
    await expect(page.getByRole('button', { name: 'Remove bookmark' }).first()).toBeVisible({ timeout: 5000 })
  })

  test('bookmark persists in the database after toggling', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}`)
    await expect(page.getByRole('button', { name: setA.name })).toBeVisible({ timeout: 15000 })

    const bookmarkBtn = page.getByRole('button', { name: 'Bookmark image' }).first()
    await bookmarkBtn.click()
    await expect(page.getByRole('button', { name: 'Remove bookmark' }).first()).toBeVisible({ timeout: 5000 })

    const { data } = await sb().from('pinned_images').select('id').eq('image_id', image.id).maybeSingle()
    expect(data).not.toBeNull()
  })

  test('unbookmarking removes it from the database', async ({ page }) => {
    await page.goto(`/galleries/${gallery.id}`)
    await expect(page.getByRole('button', { name: setA.name })).toBeVisible({ timeout: 15000 })

    const bookmarkBtn = page.getByRole('button', { name: 'Bookmark image' }).first()
    await bookmarkBtn.click()
    await expect(page.getByRole('button', { name: 'Remove bookmark' }).first()).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Remove bookmark' }).first().click()
    await expect(page.getByRole('button', { name: 'Bookmark image' }).first()).toBeVisible({ timeout: 5000 })

    const { data } = await sb().from('pinned_images').select('id').eq('image_id', image.id).maybeSingle()
    expect(data).toBeNull()
  })
})

// ── Bookmarked page — cache-busting on re-watermark ─────────────────────────

test.describe('Bookmarked page — preview cache busting', () => {
  let photographerId, gallery, setA, setB, image

  test.beforeEach(async () => {
    photographerId = await getPhotographerId()
    const created = await createTestGalleryWithSets(photographerId)
    gallery = created.gallery
    setA = created.setA
    setB = created.setB
    image = await createTestImage(photographerId, gallery.id, setA.id)
    await sb().from('pinned_images').insert({
      photographer_id: photographerId,
      image_id: image.id,
      created_at: new Date().toISOString(),
    })
  })

  test.afterEach(async () => {
    await deleteTestGallery(gallery.id)
  })

  test('Bookmarked page requests a different preview URL after the image is re-watermarked', async ({ page }) => {
    const requestedUrls = []
    page.on('request', req => {
      if (req.url().includes('/preview/')) requestedUrls.push(req.url())
    })

    await page.goto('/bookmarked')
    await page.waitForLoadState('networkidle')
    const firstBatch = [...requestedUrls]
    expect(firstBatch.length).toBeGreaterThan(0)

    // Simulate a re-watermark by bumping updated_at
    const newUpdatedAt = new Date(Date.now() + 60000).toISOString()
    await sb().from('gallery_images').update({ updated_at: newUpdatedAt }).eq('id', image.id)

    requestedUrls.length = 0
    await page.reload()
    await page.waitForLoadState('networkidle')

    expect(requestedUrls.length).toBeGreaterThan(0)
    expect(requestedUrls[0]).not.toBe(firstBatch[0])
    expect(requestedUrls[0]).toContain(encodeURIComponent(newUpdatedAt).slice(0, 10))
  })
})
