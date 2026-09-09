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

// Disposable gallery + set + a DB-only image row (no real R2 upload --
// rename doesn't depend on the preview actually loading, just on the
// menu/modal flow, so a fake key is fine here). Never touches the shared
// FIXTURE_GALLERY, since renaming would corrupt its known filenames for
// every other test that depends on them.
async function createTestGalleryWithImage() {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data: gallery, error: gErr } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `Rename Test Gallery ${uid}`,
    share_token: `pw-rename-${uid}`,
    is_active: true,
    allow_downloads: true,
    allow_favorites: true,
    allow_comments: true,
  }).select().single()
  if (gErr) throw new Error(gErr.message)

  const { data: set, error: sErr } = await sb().from('gallery_sets').insert({
    gallery_id: gallery.id,
    name: 'Original Set Name',
    sort_order: 0,
  }).select().single()
  if (sErr) throw new Error(sErr.message)

  const imageId = crypto.randomUUID()
  const { data: image, error: iErr } = await sb().from('gallery_images').insert({
    id: imageId,
    gallery_id: gallery.id,
    set_id: set.id,
    photographer_id: photographerId,
    file_name: 'original-photo.jpg',
    original_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/original/${imageId}.jpg`,
    preview_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/preview/${imageId}.webp`,
    sort_order: 0,
  }).select().single()
  if (iErr) throw new Error(iErr.message)

  return { gallery, set, image }
}

async function cleanup(galleryId) {
  await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_sets').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

test.describe('RenameModal — image rename', () => {
  test('⋮ → Rename opens a centered modal pre-filled with the current filename, Save persists it', async ({ page }) => {
    const { gallery, image } = await createTestGalleryWithImage()
    try {
      await page.goto(`/galleries/${gallery.id}`)
      await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Image menu' }).click()
      await page.getByRole('button', { name: 'Rename' }).click()

      const input = page.locator('input[value="original-photo.jpg"]')
      await expect(input).toBeVisible({ timeout: 3000 })
      await input.fill('renamed-photo.jpg')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(input).not.toBeVisible({ timeout: 3000 })

      // A single immediate read-back after the write occasionally lands
      // just ahead of commit visibility (seen intermittently in this
      // exact spot -- confirmed once already via a captured network
      // response showing the write itself succeeding correctly). Poll
      // briefly instead of assuming instant consistency on read-after-write.
      await expect.poll(async () => {
        const { data } = await sb().from('gallery_images').select('file_name').eq('id', image.id).single()
        return data.file_name
      }, { timeout: 5000 }).toBe('renamed-photo.jpg')
    } finally {
      await cleanup(gallery.id)
    }
  })

  test('Cancel closes the modal without changing the filename', async ({ page }) => {
    const { gallery, image } = await createTestGalleryWithImage()
    try {
      await page.goto(`/galleries/${gallery.id}`)
      await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Image menu' }).click()
      await page.getByRole('button', { name: 'Rename' }).click()

      const input = page.locator('input[value="original-photo.jpg"]')
      await expect(input).toBeVisible({ timeout: 3000 })
      await input.fill('should-not-save.jpg')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(input).not.toBeVisible({ timeout: 3000 })

      const { data } = await sb().from('gallery_images').select('file_name').eq('id', image.id).single()
      expect(data.file_name).toBe('original-photo.jpg')
    } finally {
      await cleanup(gallery.id)
    }
  })
})

test.describe('RenameModal — gallery set rename', () => {
  test('⋮ → Rename on a set tab opens the same modal and saves the new name', async ({ page }) => {
    const { gallery, set } = await createTestGalleryWithImage()
    try {
      await page.goto(`/galleries/${gallery.id}`)
      await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Original Set Name').first()).toBeVisible({ timeout: 5000 })

      // The "What's New" changelog modal can auto-open on a fresh browser
      // context and eats the next click if still present -- dismiss it
      // first, confirmed as the real cause of this test's first failure.
      const changelogClose = page.getByRole('button', { name: '✕' })
      if (await changelogClose.isVisible({ timeout: 1000 }).catch(() => false)) {
        await changelogClose.click()
        await expect(changelogClose).not.toBeVisible({ timeout: 3000 })
      }

      // The set's "⋮" button has its own explicit accessible name
      // ("{set name} set options"), confirmed directly from an earlier
      // failure's snapshot -- no div-scoping/parent-navigation needed at
      // all. The div-hasText approach tried first matched a 19-button
      // container (most of the page), and .last() clicked something
      // unrelated, which is why "Rename" never appeared.
      await page.getByRole('button', { name: 'Original Set Name set options' }).click()
      await page.getByRole('button', { name: 'Rename' }).click()

      const input = page.locator('input[value="Original Set Name"]')
      await expect(input).toBeVisible({ timeout: 3000 })
      await input.fill('Renamed Set')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(input).not.toBeVisible({ timeout: 3000 })

      await expect.poll(async () => {
        const { data } = await sb().from('gallery_sets').select('name').eq('id', set.id).single()
        return data.name
      }, { timeout: 5000 }).toBe('Renamed Set')
    } finally {
      await cleanup(gallery.id)
    }
  })
})
