import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Document titles (useDocumentTitle hook)
 *
 * Static pages get "{label} · FinalVault". Dynamic pages (Gallery
 * Detail here) get "{entity name} · FinalVault", falling back to
 * whatever title was already showing while data loads rather than a
 * placeholder -- so this test waits for the real title, not just
 * navigation completion.
 *
 * NOT covered here: the client-facing ClientGalleryView (bare title, no
 * FinalVault suffix -- covered conceptually by manual testing this
 * session) and the Sign-Up pages (client-facing booking pages, same
 * reasoning). Session/Client Detail's dynamic titles are structurally
 * identical to Gallery Detail's, so aren't independently re-tested here.
 */

test.describe('Document titles', () => {
  test('Galleries (Dashboard) shows "Galleries · FinalVault"', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('Galleries · FinalVault')
  })

  test('Sessions shows "Sessions · FinalVault"', async ({ page }) => {
    await page.goto('/sessions')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('Sessions · FinalVault')
  })

  test('Clients shows "Clients · FinalVault"', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('Clients · FinalVault')
  })

  test('Bookmarked shows "Bookmarked · FinalVault"', async ({ page }) => {
    await page.goto('/bookmarked')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('Bookmarked · FinalVault')
  })

  test('Account shows "Account · FinalVault"', async ({ page }) => {
    await page.goto('/account')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('Account · FinalVault')
  })

  test('Gallery Detail shows the gallery\'s own title, not the generic default', async ({ page, testGallery }) => {
    await page.goto(`/galleries/${testGallery.galleryId}`)
    await expect(page).toHaveTitle('Playwright Test Gallery · FinalVault', { timeout: 10000 })
  })
})
