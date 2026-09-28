import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite editor -- drag-to-reorder for hand-picked photo grids
 * (v1.5.16). Seeds gallery_source_image_keys with fake keys (the drag
 * only depends on the sortable tiles, not on the images loading -- same
 * reasoning as microsite-lightbox-swipe.spec.js), drags the first tile
 * onto the last, saves, and checks the persisted array order.
 */

const run = Date.now()
const KEY_A = `photographers/fake/test/order-AAA-${run}.webp`
const KEY_B = `photographers/fake/test/order-BBB-${run}.webp`
const KEY_C = `photographers/fake/test/order-CCC-${run}.webp`

test.describe('Microsite editor — hand-picked photo order', () => {
  test('dragging a hand-picked gallery photo reorders it and persists after save', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const { error } = await sb.from('microsites').update({
      show_gallery: true,
      gallery_source_type: 'manual',
      gallery_source_gallery_id: null,
      gallery_source_image_keys: [KEY_A, KEY_B, KEY_C],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const tiles = page.locator(`[data-thumb-key*="order-"][data-thumb-key$="-${run}.webp"]`)
    await expect(tiles).toHaveCount(3, { timeout: 10000 })
    await tiles.first().scrollIntoViewIfNeeded()

    const from = await tiles.nth(0).boundingBox()
    const to = await tiles.nth(2).boundingBox()
    if (!from || !to) throw new Error('tile bounding boxes not available')

    // Past the 8px activation distance first, then onto the target tile.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2, { steps: 5 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
    await page.mouse.up()

    await expect(tiles.nth(2)).toHaveAttribute('data-thumb-key', KEY_A)

    // dnd-kit briefly swallows the next click after a drop (so releasing a
    // drag never doubles as a click on whatever is underneath). Playwright
    // clicks Save within milliseconds of the drop, sometimes inside that
    // window -- retry until the save actually lands. Saving twice is
    // harmless, so a retry can't cause trouble.
    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await expect(async () => {
      if (await saveBtn.isEnabled()) await saveBtn.click()
      await expect(saveBtn).toBeDisabled({ timeout: 2000 })
    }).toPass({ timeout: 15000 })

    const { data, error: readErr } = await sb.from('microsites')
      .select('gallery_source_image_keys')
      .eq('photographer_id', testMicrosite.photographerId)
      .single()
    if (readErr) throw new Error(readErr.message)
    expect(data.gallery_source_image_keys).toEqual([KEY_B, KEY_C, KEY_A])
  })
})
