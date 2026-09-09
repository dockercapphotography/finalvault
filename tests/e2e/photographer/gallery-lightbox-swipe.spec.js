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

// Two DB-only images (no real R2 upload -- swipe navigation only depends
// on the lightbox's index state advancing, not on previews actually
// loading) in a disposable gallery, never touching the shared
// FIXTURE_GALLERY.
async function createTestGalleryWithTwoImages() {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data: gallery, error: gErr } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `Lightbox Swipe Test Gallery ${uid}`,
    share_token: `pw-swipe-${uid}`,
    is_active: true,
    allow_downloads: true,
    allow_favorites: true,
    allow_comments: true,
  }).select().single()
  if (gErr) throw new Error(gErr.message)

  const { data: set, error: sErr } = await sb().from('gallery_sets').insert({
    gallery_id: gallery.id,
    name: 'Photos',
    sort_order: 0,
  }).select().single()
  if (sErr) throw new Error(sErr.message)

  const images = []
  for (let i = 0; i < 2; i++) {
    const imageId = crypto.randomUUID()
    const { data: image, error: iErr } = await sb().from('gallery_images').insert({
      id: imageId,
      gallery_id: gallery.id,
      set_id: set.id,
      photographer_id: photographerId,
      file_name: `swipe-test-${i}.jpg`,
      original_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/original/${imageId}.jpg`,
      preview_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/preview/${imageId}.webp`,
      sort_order: i,
    }).select().single()
    if (iErr) throw new Error(iErr.message)
    images.push(image)
  }

  return { gallery, set, images }
}

async function cleanup(galleryId) {
  await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_sets').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

async function dismissChangelogIfPresent(page) {
  const changelogClose = page.getByRole('button', { name: '✕' })
  if (await changelogClose.isVisible({ timeout: 1000 }).catch(() => false)) {
    await changelogClose.click()
    await expect(changelogClose).not.toBeVisible({ timeout: 3000 })
  }
}

// Opens the lightbox via ImageCard's "Open" menu item -- known-certain
// trigger from the real component source, rather than guessing whether a
// direct click on the thumbnail also opens it.
async function openLightbox(page) {
  await page.getByRole('button', { name: 'Image menu' }).first().click()
  await page.getByRole('button', { name: 'Open' }).click()
}

// The lightbox itself has no dedicated data-testid or unique class --
// same .fixed.inset-0 pattern gallery-browse.spec.js's existing lightbox
// tests already use for a *different* lightbox component, reused here
// since GalleryDetail.jsx's photographer lightbox is built the same way.
function lightboxRoot(page) {
  return page.locator('.fixed.inset-0').last()
}

test.describe('Photographer gallery lightbox — swipe navigation', () => {
  test('trackpad wheel-swipe (deltaX) advances to the next image', async ({ page }) => {
    const { gallery, images } = await createTestGalleryWithTwoImages()
    try {
      await page.goto(`/galleries/${gallery.id}`)
      await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible({ timeout: 15000 })
      await dismissChangelogIfPresent(page)

      await openLightbox(page)
      const lightboxImg = lightboxRoot(page).locator('img')
      await expect(lightboxImg).toBeVisible({ timeout: 5000 })
      await expect(lightboxImg).toHaveAttribute('alt', images[0].file_name)

      // Position the cursor over the lightbox, then dispatch a single
      // wheel event with a clearly-horizontal deltaX -- this is exactly
      // the Mac trackpad gesture that wasn't working before today's fix
      // (trackpads fire wheel events with deltaX, never touch events).
      const box = await lightboxRoot(page).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(100, 0)

      await expect(lightboxImg).toHaveAttribute('alt', images[1].file_name, { timeout: 3000 })
    } finally {
      await cleanup(gallery.id)
    }
  })

  test('touch swipe (left) advances to the next image', async ({ page }) => {
    const { gallery, images } = await createTestGalleryWithTwoImages()
    try {
      await page.goto(`/galleries/${gallery.id}`)
      await expect(page.getByRole('heading', { name: gallery.title })).toBeVisible({ timeout: 15000 })
      await dismissChangelogIfPresent(page)

      await openLightbox(page)
      const lightboxImg = lightboxRoot(page).locator('img')
      await expect(lightboxImg).toBeVisible({ timeout: 5000 })
      await expect(lightboxImg).toHaveAttribute('alt', images[0].file_name)

      // Playwright has no built-in swipe gesture helper -- dispatching
      // real TouchEvent objects directly is the standard workaround.
      // Swiping left (finger moves from right to left) is what advances
      // to the next image per handleTouchEnd's dx < 0 branch.
      const box = await lightboxRoot(page).boundingBox()
      const centerY = box.y + box.height / 2
      await page.evaluate(({ startX, endX, y }) => {
        const el = document.elementFromPoint(startX, y)
        const makeTouch = (x, y) => new Touch({ identifier: 0, target: el, clientX: x, clientY: y })
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [makeTouch(startX, y)] }))
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [makeTouch(endX, y)] }))
      }, { startX: box.x + box.width * 0.8, endX: box.x + box.width * 0.2, y: centerY })

      await expect(lightboxImg).toHaveAttribute('alt', images[1].file_name, { timeout: 3000 })
    } finally {
      await cleanup(gallery.id)
    }
  })
})
