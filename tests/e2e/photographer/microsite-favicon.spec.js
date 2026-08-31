import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite favicon upload (Website > Content > Branding).
 *
 * Scoped deliberately to the authenticated editor UI only -- the other
 * half of this feature (CustomDomainRoot.jsx actually swapping the
 * browser-tab icon) only fires on a real custom-domain hostname, which
 * this suite has no reliable way to fake locally (see the
 * photographer_domains.photographer_id UNIQUE constraint that blocked
 * an earlier attempt at this). That half gets verified live instead.
 *
 * Uses the testMicrosite fixture (snapshot/restore around each test,
 * same as microsite-editor.spec.js) plus the sb fixture to force a known
 * favicon_r2_key before each test, since these tests care about exact
 * before/after UI states rather than whatever's currently on the account.
 */

test.describe('Microsite favicon', () => {
  test('no favicon uploaded shows the add-a-favicon prompt', async ({ page, testMicrosite, sb }) => {
    await sb.from('microsites').update({ favicon_r2_key: null }).eq('photographer_id', testMicrosite.photographerId)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('+ Add a favicon')).toBeVisible()
    await page.getByText('+ Add a favicon').click()

    await expect(page.getByRole('button', { name: 'Upload a favicon' })).toBeVisible()
    await expect(page.getByText('Falls back to the FinalVault icon if not set.', { exact: false })).toBeVisible()
  })

  test('uploading a favicon shows a preview and persists after save + reload', async ({ page, testMicrosite, sb }) => {
    await sb.from('microsites').update({ favicon_r2_key: null }).eq('photographer_id', testMicrosite.photographerId)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await page.getByText('+ Add a favicon').click()
    const faviconInput = page.locator('input[type="file"][accept*="x-icon"]')
    await expect(faviconInput).toBeAttached()
    await faviconInput.setInputFiles('tests/fixtures/test-images/test_image.jpg')

    await expect(page.getByText('Favicon set')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Replace' })).toBeVisible()

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Favicon set')).toBeVisible({ timeout: 10000 })

    // testMicrosite's own fixture teardown restores favicon_r2_key to null
    // afterward -- the uploaded R2 object itself is left in place, same as
    // the avatar-upload test above leaves its own upload in place.
  })

  test('removing an existing favicon reverts to the fallback prompt', async ({ page, testMicrosite, sb }) => {
    await sb.from('microsites')
      .update({ favicon_r2_key: `photographers/${testMicrosite.photographerId}/logos/microsite-favicon-pw-test.png` })
      .eq('photographer_id', testMicrosite.photographerId)
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Favicon set')).toBeVisible()

    // Plain getByRole('button', { name: 'Remove' }) is ambiguous here -- the
    // dark-logo section right above this one has its own "Remove" button
    // with the identical label, and shows at the same time whenever the
    // test account already has a dark logo set. Scope to the favicon
    // panel specifically (the innermost div wrapping "Favicon set" and
    // its buttons) so this doesn't depend on that unrelated account state.
    const faviconPanel = page.locator('div').filter({ hasText: 'Favicon set' }).last()
    await faviconPanel.getByRole('button', { name: 'Remove' }).click()

    // Removing clears favicon_r2_key without setting showFaviconSection,
    // so the panel collapses straight back to the closed "+ Add a favicon"
    // teaser -- same as the pre-existing dark-logo section's identical
    // (site.logo_dark_r2_key || showDarkLogoSection) pattern. It does not
    // stay open showing the "Optional..." explainer text.
    await expect(page.getByText('+ Add a favicon')).toBeVisible({ timeout: 10000 })

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('+ Add a favicon')).toBeVisible({ timeout: 10000 })
  })
})
