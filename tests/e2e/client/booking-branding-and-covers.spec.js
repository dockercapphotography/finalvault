import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

// Covers the v1.5.11 booking-page redesign's new visual features on the
// single-session public booking page (/book/:token): microsite branding
// (colors/studio name), per-category session-type icons, the illustrated
// cover-pattern picker, and the real-uploaded-cover-photo + focal-point
// feature. Same fixture conventions as signup-booking.spec.js (service-
// role client, direct table writes, cleanup by id in a finally block) --
// this suite only adds NEW assertions for what this version introduced,
// it doesn't re-cover the base booking flow (slot picking, claiming,
// confirmation) that file already exercises.
//
// All assertions below are scoped to the DESKTOP rail
// ([data-testid="booking-hero-desktop"]) rather than the mobile stacked
// layout ([data-testid="booking-hero-mobile"]) -- both render into the DOM
// simultaneously (Tailwind's lg: breakpoint just toggles which one is
// visible via CSS), and this repo's Playwright gate only ever runs the
// chromium project (Desktop Chrome, >=1024px wide), so the desktop rail is
// always the visible one here. See BookingHero.jsx's own comment for why
// the two layouts are separate DOM trees rather than one reflowing via
// breakpoints.

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

async function createSignupPage(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('signup_pages').insert({
    photographer_id: photographerId,
    title: 'Booking Cover Test Page',
    token: `booking-cover-test-${crypto.randomUUID().slice(0, 8)}`,
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId,
    name: 'Test Shoot',
    duration_minutes: 15,
    session_type: 'Portrait',
    sort_order: 0,
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupSignupPage(pageId) {
  await sb().from('signup_pages').delete().eq('id', pageId)
}

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// Snapshot/restore the account's one-row `microsites` table around a test,
// same pattern fixtures.js's testMicrosite fixture uses for the
// authenticated microsite editor suites -- duplicated locally rather than
// imported from there, since importing that file's `test` would also pull
// in its pre-authenticated `page` fixture, which is wrong for these public,
// logged-out booking pages (same reasoning signup-booking.spec.js and
// all-sessions-booking.spec.js already document for keeping their own
// local `sb()`/fixture helpers instead of sharing fixtures.js's).
async function withMicrosite(overrides, fn) {
  const photographerId = await getPhotographerId()
  const { data: existing } = await sb().from('microsites').select('*').eq('photographer_id', photographerId).maybeSingle()
  if (existing) {
    const { error } = await sb().from('microsites').update(overrides).eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb().from('microsites').insert({ photographer_id: photographerId, ...overrides })
    if (error) throw new Error(error.message)
  }
  try {
    await fn()
  } finally {
    if (existing) {
      const { id, ...rest } = existing
      await sb().from('microsites').update(rest).eq('id', id)
    } else {
      await sb().from('microsites').delete().eq('photographer_id', photographerId)
    }
  }
}

// Reads the literal (unresolved) value of a --bk-* custom property off the
// page's branding wrapper div -- the one element every booking page spreads
// `bkVars` onto (see useBookingBranding.js). Custom properties aren't
// substituted the way normal CSS properties are, so a value like
// 'var(--bg)' comes back as that literal string, not whatever color it
// would eventually resolve to -- which is exactly what these tests want to
// assert on: the *token* useBookingBranding chose, not a resolved color
// that would also depend on the app's own light/dark mode.
async function readBkVar(page, varName) {
  // "--bk-bg:" (colon immediately after) only ever appears where bkVars is
  // actually *declared* -- the page's single outer wrapper div. A plain
  // *usage* like `background: var(--bk-bg)` elsewhere on the page would
  // also contain the substring "--bk-bg", but never followed directly by a
  // colon, so this stays a precise, single-element match without relying
  // on DOM/document order the way a bare `.first()` would.
  const wrapper = page.locator('[style*="--bk-bg:"]')
  return wrapper.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), varName)
}

test.describe('Public booking page branding and covers', () => {
  test('an enabled microsite\'s theme, accent color, and studio name flow through', async ({ page }) => {
    await withMicrosite({
      enabled: true, theme: 'dark', accent_color: '#2f6f4e',
      studio_name: 'Golden Hour Studio', logo_r2_key: null,
    }, async () => {
      const signupPage = await createSignupPage()
      await createShootType(signupPage.id)
      try {
        await page.goto(`/book/${signupPage.token}`)
        await waitForReady(page)

        expect(await readBkVar(page, '--bk-accent')).toBe('#2f6f4e')
        // THEME_OPTIONS' 'dark' entry (micrositeThemeOptions.js) -- asserted
        // literally rather than imported, so this test also catches an
        // accidental change to that theme's own bg value.
        expect(await readBkVar(page, '--bk-bg')).toBe('#12151F')

        // No logo_r2_key set -- BrandHeader falls back to an initials badge
        // plus the studio name text, both on the desktop overlay rail.
        const desktopHeader = page.locator('[data-testid="booking-hero-desktop"]')
        await expect(desktopHeader.getByText('Golden Hour Studio')).toBeVisible()
        await expect(desktopHeader.getByText('GS', { exact: true })).toBeVisible()
      } finally {
        await cleanupSignupPage(signupPage.id)
      }
    })
  })

  test('no enabled microsite falls back to the default indigo accent, no custom theme', async ({ page }) => {
    await withMicrosite({ enabled: false }, async () => {
      const signupPage = await createSignupPage()
      await createShootType(signupPage.id)
      try {
        await page.goto(`/book/${signupPage.token}`)
        await waitForReady(page)

        expect(await readBkVar(page, '--bk-accent')).toBe('#6366f1')
        // bkVars sets --bk-bg to the literal token 'var(--bg)' when there's
        // no microsite branding (see useBookingBranding.js) -- but Chrome's
        // getComputedStyle resolves that nested var() reference down to
        // --bg's own current color rather than handing back the token text
        // (custom-property computed values aren't preserved unresolved the
        // way the CSS spec describes -- confirmed empirically, not assumed:
        // an earlier version of this test asserted the literal string and
        // got back a resolved hex color instead). Comparing against --bg
        // read on the same element sidesteps relying on either the raw
        // token or a hardcoded color, and stays correct regardless of the
        // app's own light/dark default.
        expect(await readBkVar(page, '--bk-bg')).toBe(await readBkVar(page, '--bg'))
      } finally {
        await cleanupSignupPage(signupPage.id)
      }
    })
  })

  test('session-type icons match each shoot type\'s category, not a generic camera', async ({ page }) => {
    const signupPage = await createSignupPage()
    await createShootType(signupPage.id, { name: 'First Look', session_type: 'Wedding', sort_order: 0 })
    await createShootType(signupPage.id, { name: 'Team Photos', session_type: 'Sports', sort_order: 1 })
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      // Multiple shoot types -- the picker step, so both icons show at once.
      await expect(page.getByText('First Look')).toBeVisible()
      await expect(page.locator('svg.lucide-heart')).toBeVisible()
      await expect(page.getByText('Team Photos')).toBeVisible()
      await expect(page.locator('svg.lucide-trophy')).toBeVisible()
      await expect(page.locator('svg.lucide-camera')).toHaveCount(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('cover pattern selection changes the illustrated cover, and unset defaults to mountains', async ({ page }) => {
    const defaultPage = await createSignupPage({ title: 'Default Pattern Page' }) // cover_pattern left null
    await createShootType(defaultPage.id)
    const treesPage = await createSignupPage({ title: 'Trees Pattern Page', cover_pattern: 'trees' })
    await createShootType(treesPage.id)
    const mountainsPage = await createSignupPage({ title: 'Mountains Pattern Page', cover_pattern: 'mountains' })
    await createShootType(mountainsPage.id)

    try {
      const coverSvg = page.locator('[data-testid="booking-hero-desktop"] [data-testid="booking-cover"]')

      await page.goto(`/book/${defaultPage.token}`)
      await waitForReady(page)
      await expect(coverSvg.locator('svg')).toBeVisible()
      await expect(coverSvg.locator('img')).not.toBeAttached()
      const defaultMarkup = await coverSvg.locator('svg').innerHTML()

      await page.goto(`/book/${treesPage.token}`)
      await waitForReady(page)
      const treesMarkup = await coverSvg.locator('svg').innerHTML()
      expect(treesMarkup).not.toBe(defaultMarkup)

      await page.goto(`/book/${mountainsPage.token}`)
      await waitForReady(page)
      const mountainsMarkup = await coverSvg.locator('svg').innerHTML()
      // No cover_pattern set defaults to the same rendering as an explicit
      // 'mountains' selection -- DEFAULT_COVER_PATTERN (coverPatterns.js).
      expect(mountainsMarkup).toBe(defaultMarkup)
    } finally {
      await cleanupSignupPage(defaultPage.id)
      await cleanupSignupPage(treesPage.id)
      await cleanupSignupPage(mountainsPage.id)
    }
  })

  test('an uploaded cover photo renders as a real image at its chosen focal point, not the pattern', async ({ page }) => {
    const signupPage = await createSignupPage({
      cover_image_r2_key: FIXTURE_GALLERY.images[0].previewR2Key,
      cover_focus_x: 0.25, cover_focus_y: 0.75,
    })
    await createShootType(signupPage.id)
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)

      const cover = page.locator('[data-testid="booking-hero-desktop"] [data-testid="booking-cover"]')
      await expect(cover.locator('svg')).not.toBeAttached()
      const img = cover.locator('img')
      await expect(img).toBeVisible()
      await expect(img).toHaveAttribute('src', new RegExp(
        `/preview/${encodeURIComponent(FIXTURE_GALLERY.images[0].previewR2Key)}\\?booking_cover=1`
      ))
      await expect(img).toHaveCSS('object-position', '25% 75%')

      // Confirms the R2 Worker's public ?booking_cover=1 preview mode
      // (step 8) actually served real image bytes, not just that the <img>
      // tag exists with the right src -- a broken/blocked image would
      // report naturalWidth 0 here.
      await expect.poll(() => img.evaluate(el => el.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})
