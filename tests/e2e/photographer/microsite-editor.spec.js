import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite editor — core content/save flows.
 *
 * Uses the testMicrosite fixture (snapshot/restore around each test,
 * since microsites is one row per photographer, not something tests
 * can freely create/delete the way galleries work).
 */

test.describe('Microsite editor', () => {
  test('editor loads and shows the Website heading', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
  })

  test('toggling Website enabled persists after reload', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const toggle = page.getByTestId('microsite-enabled-toggle')
    const wasChecked = await toggle.isChecked()

    await toggle.click({ force: true })
    await expect(toggle).toBeChecked({ checked: !wasChecked })

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('microsite-enabled-toggle')).toBeChecked({ checked: !wasChecked })
  })

  test('editing a content field persists after save and reload', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const uniqueTitle = `Reviews ${Date.now()}`
    await page.getByPlaceholder('Reviews').fill(uniqueTitle)

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    await page.reload()
    await expect(page.getByPlaceholder('Reviews')).toHaveValue(uniqueTitle, { timeout: 10000 })
  })

  test('disabling the Testimonials section hides its content fields', async ({ page, testMicrosite }) => {
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await expect(page.getByPlaceholder('Reviews')).toBeVisible()

    await page.getByTestId('show-testimonials-toggle').click({ force: true })
    await expect(page.getByPlaceholder('Reviews')).not.toBeVisible()

    // Toggling back on brings the fields back
    await page.getByTestId('show-testimonials-toggle').click({ force: true })
    await expect(page.getByPlaceholder('Reviews')).toBeVisible()
  })

  test('Content and Design tabs switch panels on desktop', async ({ page, testMicrosite }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const tabs = page.getByTestId('desktop-tabs')
    await expect(page.getByPlaceholder('Reviews')).toBeVisible()

    await tabs.getByRole('button', { name: 'Design' }).click()
    await expect(page.getByPlaceholder('Reviews')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible()

    await tabs.getByRole('button', { name: 'Content' }).click()
    await expect(page.getByPlaceholder('Reviews')).toBeVisible()
  })

  test('selecting a theme swatch registers as an unsaved change', async ({ page, testMicrosite }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    await page.getByTestId('desktop-tabs').getByRole('button', { name: 'Design' }).click()

    // Themes render their name as visible button text (Light, Cool Slate,
    // Dark, Deep Jewel, High Contrast, Warm Muted, Blush Soft) -- exact
    // match avoids "Dark" fuzzy-matching "Deep Jewel"-style neighbors.
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(page.getByText('Unsaved changes')).toBeVisible({ timeout: 5000 })
  })
})
