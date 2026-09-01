import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite public-facing testimonials render, via /website/preview (see
 * microsite-preview.spec.js for why that route is used instead of a real
 * hostname). Covers v1.5.11 steps 16-19's Spotlight cross-slide, Ticker
 * hover-pause, and Stack no-stretch fixes.
 *
 * Seeds the microsites row directly through the sb fixture (service-role
 * client) rather than driving the editor UI -- these tests are about the
 * PUBLIC RENDERER's behavior, not the editor, and a direct row update
 * both sidesteps interference from whatever testimonials the shared test
 * account already has (an update replaces the whole testimonials array,
 * not appends to it) and skips the desktop-only SectionPicker popover
 * entirely, which the editor-focused spec already exercises indirectly.
 */

test.describe('Microsite public preview — testimonials', () => {
  test('Spotlight cross-slide actually changes the visible testimonial on next/prev', async ({ page, testMicrosite, sb }) => {
    const quote1 = `PW spotlight one ${Date.now()}`
    const quote2 = `PW spotlight two ${Date.now()}`
    const { error } = await sb.from('microsites').update({
      enabled: true, show_testimonials: true,
      section_variants: { testimonials: 'spotlight' },
      testimonials: [
        { quote: quote1, name: 'Jordan M.', session_type: 'Portrait' },
        { quote: quote2, name: 'Casey R.', session_type: 'Wedding' },
      ],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website/preview')
    await expect(page.getByText(quote1)).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Next testimonial' }).click()
    await expect(page.getByText(quote2)).toBeVisible({ timeout: 10000 })
    // Both testimonials are genuinely on screen and moving together for
    // the ~600ms cross-slide (that's the whole point of step 19's fix),
    // so this only settles false once the transition actually finishes
    // and the outgoing one leaves the DOM -- Playwright's auto-retrying
    // assertion covers that without a hardcoded wait.
    await expect(page.getByText(quote1)).not.toBeVisible()

    await page.getByRole('button', { name: 'Previous testimonial' }).click()
    await expect(page.getByText(quote1)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(quote2)).not.toBeVisible()
  })

  test('Ticker pauses its scroll animation on hover and resumes on mouse-out', async ({ page, testMicrosite, sb }) => {
    const { error } = await sb.from('microsites').update({
      enabled: true, show_testimonials: true,
      section_variants: { testimonials: 'ticker' },
      testimonials: [
        { quote: `PW ticker one ${Date.now()}`, name: 'Jordan M.', session_type: 'Portrait' },
        { quote: `PW ticker two ${Date.now()}`, name: 'Casey R.', session_type: 'Wedding' },
      ],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website/preview')
    const track = page.locator('.ms-t-ticker-track')
    await expect(track).toBeVisible({ timeout: 10000 })
    await expect(track).toHaveCSS('animation-play-state', 'running')

    await page.locator('.ms-t-ticker-wrap').hover()
    await expect(track).toHaveCSS('animation-play-state', 'paused')

    await page.mouse.move(0, 0)
    await expect(track).toHaveCSS('animation-play-state', 'running')
  })

  test('Stack layout centers a short last row without stretching its cards', async ({ page, testMicrosite, sb }) => {
    // 4 testimonials -- a 3-per-row grid leaves exactly 1 on the last
    // row. Before the flex-grow: 0 fix (step 17), that lone card
    // stretched to fill the whole row's leftover width instead of
    // staying its normal one-third size and centering.
    const { error } = await sb.from('microsites').update({
      enabled: true, show_testimonials: true,
      section_variants: { testimonials: 'stack' },
      testimonials: [
        { quote: 'One', name: 'Client One' },
        { quote: 'Two', name: 'Client Two' },
        { quote: 'Three', name: 'Client Three' },
        { quote: 'Four', name: 'Client Four' },
      ],
    }).eq('photographer_id', testMicrosite.photographerId)
    if (error) throw new Error(error.message)

    await page.goto('/website/preview')
    const cards = page.locator('.ms-t-card')
    await expect(cards).toHaveCount(4, { timeout: 10000 })

    const widths = []
    for (let i = 0; i < 4; i++) {
      const box = await cards.nth(i).boundingBox()
      widths.push(box.width)
    }
    // The first three (a full row) should already match each other.
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(5)
    expect(Math.abs(widths[1] - widths[2])).toBeLessThan(5)
    // The 4th, alone on the last row, should be the SAME width as the
    // others -- centered, not stretched to fill the row.
    expect(Math.abs(widths[3] - widths[0])).toBeLessThan(5)
  })
})
