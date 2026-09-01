#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 13: Playwright coverage for
everything steps 1-12 added.

Requires steps 1 through 12 already applied.

Testing-gate patch, not a feature change -- adds new e2e coverage for the
booking-redesign arc's new visual behavior (branding colors/theme, session-
type icons, the cover-pattern picker, real cover-photo + focal point, and
the All Sessions page's new image-forward cards) without touching anything
about how the booking pages themselves work.

Four files:

1. MODIFIED src/components/booking/BookingCover.jsx -- adds
   data-testid="booking-cover" to its outer div. Purely a test hook, zero
   visual/behavioral change.

2. MODIFIED src/components/booking/BookingHero.jsx -- adds
   data-testid="booking-hero-mobile" / "booking-hero-desktop" to its two
   breakpoint wrapper divs. Both layouts render into the DOM at once
   (Tailwind's lg: classes just toggle which is visible via CSS) -- these
   testids let the new tests scope to the one that's actually visible
   (the desktop rail, since this repo's Playwright gate only runs the
   chromium project at a >=1024px viewport) without depending on Tailwind
   class internals. Also purely additive, zero visual change.

3. NEW tests/e2e/client/booking-branding-and-covers.spec.js -- covers the
   /book/:token page's new features: an enabled microsite's theme/accent/
   studio-name flowing into the page's --bk-* CSS variables and header, the
   no-microsite fallback to the default indigo look, session-type icons
   matching each shoot type's category instead of a generic camera, the
   cover-pattern picker actually changing what renders (and defaulting to
   mountains when unset), and an uploaded cover photo rendering as a real
   <img> at its chosen focal point (including confirming the R2 Worker's
   public ?booking_cover=1 preview mode actually serves bytes, not just
   that the <img> tag exists).

4. MODIFIED tests/e2e/client/all-sessions-booking.spec.js -- one new test
   for the /book/all/:token chooser's step-12 cards: each one now leads
   with its own cover (pattern or real photo) instead of the old shared
   generic camera icon.

Run from the repo root, after steps 1 through 12. Idempotent -- safe to
run twice.

Next steps:
  1. Apply this patch, then run just the new coverage in isolation:
       npx playwright test booking-branding-and-covers.spec.js all-sessions-booking.spec.js --project=chromium
     and confirm everything passes.
  2. Run the full existing suite to confirm nothing else broke:
       npx playwright test --project=chromium
  3. That's the full testing gate from here -- once it's green, we're
     clear to move to deployment.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def write_file(rel_path, content):
    path = ROOT / rel_path
    if path.exists() and path.read_text() == content:
        print(f"  (no changes needed -- {rel_path} already up to date)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    print(f"Wrote {rel_path}")


def patch_file(rel_path, replacements):
    path = ROOT / rel_path
    text = path.read_text()
    changed = False
    for old, new, expected_count in replacements:
        if new in text:
            continue
        count = text.count(old)
        assert count == expected_count, (
            f"{rel_path}: expected {expected_count} occurrence(s) of a block, found {count}.\n"
            f"--- block ---\n{old}\n-------------"
        )
        text = text.replace(old, new)
        changed = True
    if not changed:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    path.write_text(text)
    print(f"Patched {rel_path}")


# ── 1. BookingCover.jsx -- test hook only ────────────────────────────────────
patch_file("src/components/booking/BookingCover.jsx", [
    (
        '''    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>''',
        '''    <div data-testid="booking-cover" style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>''',
        1,
    ),
])

# ── 2. BookingHero.jsx -- test hooks only ────────────────────────────────────
patch_file("src/components/booking/BookingHero.jsx", [
    (
        '''      <div className="lg:hidden">
        <div style={{ position: 'relative' }}>''',
        '''      <div className="lg:hidden" data-testid="booking-hero-mobile">
        <div style={{ position: 'relative' }}>''',
        1,
    ),
    (
        '''      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[400px]"
        style={{ background: 'var(--bk-bg)', borderRight: '1px solid var(--bk-border)' }}>''',
        '''      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[400px]" data-testid="booking-hero-desktop"
        style={{ background: 'var(--bk-bg)', borderRight: '1px solid var(--bk-border)' }}>''',
        1,
    ),
])

# ── 3. NEW tests/e2e/client/booking-branding-and-covers.spec.js ─────────────
write_file("tests/e2e/client/booking-branding-and-covers.spec.js", '''import { test, expect } from '@playwright/test'
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
  test('an enabled microsite\\'s theme, accent color, and studio name flow through', async ({ page }) => {
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
        expect(await readBkVar(page, '--bk-bg')).toBe('var(--bg)')
      } finally {
        await cleanupSignupPage(signupPage.id)
      }
    })
  })

  test('session-type icons match each shoot type\\'s category, not a generic camera', async ({ page }) => {
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
        `/preview/${encodeURIComponent(FIXTURE_GALLERY.images[0].previewR2Key)}\\\\?booking_cover=1`
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
''')

# ── 4. all-sessions-booking.spec.js -- step-12 card cover coverage ─────────
patch_file("tests/e2e/client/all-sessions-booking.spec.js", [
    (
        '''import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Same fixture conventions as signup-booking.spec.js (service-role Supabase
// client, direct table writes instead of going through the UI, cleanup by
// id/email in a finally block) -- this suite exercises the *aggregate*
// public booking page (/book/all/:token) rather than a single page's.''',
        '''import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

// Same fixture conventions as signup-booking.spec.js (service-role Supabase
// client, direct table writes instead of going through the UI, cleanup by
// id/email in a finally block) -- this suite exercises the *aggregate*
// public booking page (/book/all/:token) rather than a single page's.''',
        1,
    ),
    (
        '''    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(emptyPage.id)
      await cleanupSignupPage(otherPage.id)
    }
  })
})''',
        '''    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(emptyPage.id)
      await cleanupSignupPage(otherPage.id)
    }
  })

  // v1.5.11 step 12: each row's cover is now that session's own real
  // preview (illustrated pattern, or an uploaded photo) via BookingCover,
  // the same component /book/:token uses -- not the plain generic camera
  // icon every row used to share.
  test('each session card leads with its own cover -- pattern or real photo -- not a generic icon', async ({ page }) => {
    const photographer = await getPhotographer()
    const patternPage = await createSignupPage(photographer.id, { title: 'Trees Pattern Session', cover_pattern: 'trees' })
    const shootTypeA = await createShootType(patternPage.id)
    const slotA = futureSlot(4)
    await createSlot(patternPage.id, shootTypeA.id, slotA.start.toISOString(), slotA.end.toISOString())

    const photoPage = await createSignupPage(photographer.id, {
      title: 'Real Photo Session',
      cover_image_r2_key: FIXTURE_GALLERY.images[0].previewR2Key,
      cover_focus_x: 0.25, cover_focus_y: 0.75,
    })
    const shootTypeB = await createShootType(photoPage.id)
    const slotB = futureSlot(6)
    await createSlot(photoPage.id, shootTypeB.id, slotB.start.toISOString(), slotB.end.toISOString())

    const parked = await deactivateOtherActivePages(photographer.id, [patternPage.id, photoPage.id])
    try {
      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)

      const patternCard = page.locator('a').filter({ hasText: 'Trees Pattern Session' })
      await expect(patternCard.locator('[data-testid="booking-cover"] svg')).toBeVisible()
      await expect(patternCard.locator('[data-testid="booking-cover"] img')).not.toBeAttached()

      const photoCard = page.locator('a').filter({ hasText: 'Real Photo Session' })
      const photoImg = photoCard.locator('[data-testid="booking-cover"] img')
      await expect(photoImg).toBeVisible()
      await expect(photoImg).toHaveAttribute('src', new RegExp(
        `/preview/${encodeURIComponent(FIXTURE_GALLERY.images[0].previewR2Key)}\\\\?booking_cover=1`
      ))
      await expect(photoImg).toHaveCSS('object-position', '25% 75%')

      // The old generic camera icon every row used to share is gone now
      // that each card leads with its own real cover.
      await expect(page.locator('svg.lucide-camera')).toHaveCount(0)
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(patternPage.id)
      await cleanupSignupPage(photoPage.id)
    }
  })
})''',
        1,
    ),
])
