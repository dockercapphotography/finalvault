import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite public-facing render, via /website/preview -- an
 * authenticated route (see MicrositePreviewPage.jsx) that renders the
 * same MicrositeRenderer real visitors see, fetched by auth instead of
 * by hostname, always reflecting the last SAVED state (no live-editing
 * sync needed since it's a fresh page load, not the embedded iframe).
 */

test.describe('Microsite public preview', () => {
  test('a saved content change appears on the preview page', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    // Make sure the site is enabled -- get_site_by_hostname (and this
    // same-shaped preview fetch) only returns full content when enabled.
    const enabledToggle = page.getByTestId('microsite-enabled-toggle')
    if (!(await enabledToggle.isChecked())) {
      await enabledToggle.click({ force: true })
    }

    // Contact section title -- Testimonials/About both require actual
    // content beyond their toggle to render at all (hasTestimonials
    // needs testimonials.length > 0, hasAbout needs bio/photo/stats),
    // which the test photographer's freshly auto-created row won't
    // have. Contact only needs one of email/phone/address, so filling
    // contact_email here as well guarantees the section renders
    // regardless of whatever the profile already has set.
    const uniqueTitle = `PW Contact ${Date.now()}`
    await page.getByPlaceholder('Contact').fill(uniqueTitle)
    await page.getByPlaceholder('hello@yourstudio.com').fill('pwtest@example.com')

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.goto('/website/preview')
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 10000 })
  })
})
