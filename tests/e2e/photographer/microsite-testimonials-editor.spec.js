import { test, expect } from '../../fixtures/fixtures.js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

/**
 * Microsite editor — testimonial add/cancel/save behavior (v1.5.11 steps
 * 16-17). Uses the testMicrosite fixture (snapshot/restore around each
 * test, since microsites is one row per photographer).
 *
 * "Add testimonial" always appends to the end of the array, so the card
 * we just added is reliably the LAST card whose Quote textarea is
 * present (a closed/saved row has no such textarea at all) -- scoping
 * every locator through that, rather than assuming it's the only open
 * card on the page, keeps these tests correct even if the shared test
 * account already has other testimonials (complete or not) sitting
 * around from earlier runs or manual testing.
 */

function openCard(page) {
  return page.locator('div.rounded-lg.p-3.space-y-2')
    .filter({ has: page.getByPlaceholder('What the client said') })
    .last()
}

test.describe('Microsite editor — testimonials', () => {
  test('Cancel removes a never-finished testimonial', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const quote = `PW cancel-incomplete ${Date.now()}`
    await page.getByRole('button', { name: 'Add testimonial' }).click()
    const card = openCard(page)
    await card.getByPlaceholder('What the client said').fill(quote)
    // Name left blank on purpose -- still incomplete, so Done stays
    // disabled and Cancel is the only way out.
    await expect(card.getByRole('button', { name: 'Done' })).toBeDisabled()

    await card.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(quote)).not.toBeVisible()
  })

  test('Cancel on a complete-but-unsaved entry closes it without deleting it, and it survives Save', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const quote = `PW cancel-complete ${Date.now()}`
    const name = 'Jordan M.'
    await page.getByRole('button', { name: 'Add testimonial' }).click()
    const card = openCard(page)
    await card.getByPlaceholder('What the client said').fill(quote)
    await card.getByPlaceholder('e.g. Jordan M.').fill(name)

    // Complete now (both quote and name filled) -- Cancel here should
    // just close the form, not remove the entry the way it does for an
    // incomplete one.
    await card.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(quote)).toBeVisible({ timeout: 5000 })

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByText(quote)).toBeVisible({ timeout: 10000 })
  })

  test('an incomplete testimonial does not survive Save', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const quote = `PW incomplete-on-save ${Date.now()}`
    await page.getByRole('button', { name: 'Add testimonial' }).click()
    const card = openCard(page)
    await card.getByPlaceholder('What the client said').fill(quote)
    // Name intentionally left blank -- Save should drop this one from
    // what actually gets persisted, same completeness rule the public
    // renderer already applies.

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByText(quote)).not.toBeVisible()
  })

  test('the testimonial photo picker loads thumbnails via a token URL, not a blob fetch', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Add testimonial' }).click()
    const card = openCard(page)
    await card.getByRole('button', { name: 'Add photo' }).click()

    await page.getByPlaceholder('Search galleries...').fill(FIXTURE_GALLERY.title)
    // exact: true -- the test account also has a "Comments Fixture
    // Gallery" (COMMENTS_FIXTURE_GALLERY in fixtures.js), whose name
    // also contains this substring, so a non-exact match resolves to
    // both buttons instead of just the one actually named this.
    await page.getByRole('button', { name: FIXTURE_GALLERY.title, exact: true }).click()

    const firstImg = page.locator('.grid.grid-cols-4 img').first()
    await expect(firstImg).toBeVisible({ timeout: 10000 })
    const src = await firstImg.getAttribute('src')
    // The actual regression this guards: previously every thumbnail was
    // an authenticated fetch()+blob()+createObjectURL() call, one at a
    // time in a serial loop. Now it's a plain <img src> carrying the
    // JWT as a ?token= query param (same pattern GalleryGrid.jsx already
    // used for the main dashboard grid), so the browser can load every
    // thumbnail in parallel with normal HTTP caching.
    expect(src).toMatch(/\/preview\/.+\?token=/)
    expect(src?.startsWith('blob:')).toBe(false)

    // Close the picker, then drop the still-incomplete testimonial this
    // test created (no photo was ever picked) so nothing is left behind
    // in the shared test account.
    await page.locator('svg.lucide-x').last().click()
    await card.getByRole('button', { name: 'Cancel' }).click()
  })
})
