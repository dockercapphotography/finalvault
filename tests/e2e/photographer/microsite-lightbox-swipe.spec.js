import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite gallery lightbox -- swipe navigation, via /website/preview
 * (same pattern microsite-testimonials-render.spec.js already uses: seed
 * content directly through the sb fixture, since these tests are about
 * the PUBLIC RENDERER's behavior, not the editor UI).
 *
 * gallery_source_type: 'manual' + gallery_source_image_keys lets this
 * seed the Gallery section directly with fake keys -- no real gallery or
 * uploaded images needed at all, since swipe navigation only depends on
 * the lightbox's index state advancing, not on the images actually
 * loading (same reasoning as the photographer-lightbox spec).
 */

const KEY_A = 'photographers/fake/test/swipe-marker-AAA.webp'
const KEY_B = 'photographers/fake/test/swipe-marker-BBB.webp'

test.describe('Microsite gallery lightbox — swipe navigation', () => {
  test('trackpad wheel-swipe (deltaX) advances to the next image', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const { error } = await sb.from('microsites').update({
      enabled: true,
      show_gallery: true,
      gallery_source_type: 'manual',
      gallery_source_image_keys: [KEY_A, KEY_B],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website/preview')

    const galleryItem = page.locator(
      '.ms-gallery-item, .ms-gallery-masonry-item, .ms-gallery-carousel-item, .ms-gallery-featured-main'
    ).first()
    await expect(galleryItem).toBeVisible({ timeout: 10000 })
    await galleryItem.click()

    const lightboxImg = page.locator('.ms-lightbox-img')
    await expect(page.locator('.ms-lightbox')).toBeVisible({ timeout: 5000 })
    await expect(lightboxImg).toHaveAttribute('src', /swipe-marker-AAA/)

    const box = await page.locator('.ms-lightbox').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(100, 0)

    await expect(lightboxImg).toHaveAttribute('src', /swipe-marker-BBB/, { timeout: 3000 })
  })

  test('touch swipe (left) advances to the next image', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const { error } = await sb.from('microsites').update({
      enabled: true,
      show_gallery: true,
      gallery_source_type: 'manual',
      gallery_source_image_keys: [KEY_A, KEY_B],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website/preview')

    const galleryItem = page.locator(
      '.ms-gallery-item, .ms-gallery-masonry-item, .ms-gallery-carousel-item, .ms-gallery-featured-main'
    ).first()
    await expect(galleryItem).toBeVisible({ timeout: 10000 })
    await galleryItem.click()

    const lightboxImg = page.locator('.ms-lightbox-img')
    await expect(page.locator('.ms-lightbox')).toBeVisible({ timeout: 5000 })
    await expect(lightboxImg).toHaveAttribute('src', /swipe-marker-AAA/)

    const box = await page.locator('.ms-lightbox').boundingBox()
    const centerY = box.y + box.height / 2
    await page.evaluate(({ startX, endX, y }) => {
      const el = document.elementFromPoint(startX, y)
      const makeTouch = (x, y) => new Touch({ identifier: 0, target: el, clientX: x, clientY: y })
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [makeTouch(startX, y)] }))
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [makeTouch(endX, y)] }))
    }, { startX: box.x + box.width * 0.8, endX: box.x + box.width * 0.2, y: centerY })

    await expect(lightboxImg).toHaveAttribute('src', /swipe-marker-BBB/, { timeout: 3000 })
  })
})
