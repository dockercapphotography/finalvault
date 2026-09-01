#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 14: fix the All Sessions
page's dead branding fallback, plus two test fixes the first full
Playwright run surfaced.

Requires steps 1 through 13 already applied.

Three things, from running the new + existing suites for real:

1. NEW sql/064... no -- sql/063_all_sessions_branding_fallback_fix.sql.
   The bug flagged as a minor aside when step 13 shipped: get_signup_pages_
   by_token's `branding` subquery was written as a plain FROM/WHERE against
   `microsites` (no join) --

     FROM microsites m
     WHERE m.photographer_id = v_photographer.id AND m.enabled = true

   -- so a photographer with no enabled microsite matches ZERO rows, and
   the subquery's CASE (which is what produces the has_microsite:false
   fallback) never runs at all -- the whole thing returns SQL NULL instead.
   The frontend's own `data?.branding || {...}` default masks this well
   enough that the page still looks right (same default indigo colors
   either way), but it means that photographer's own account name/logo
   never shows in the /book/all/:token header, unlike the single-page
   /book/:token RPC (get_signup_page_data), which already gets this right
   via a LEFT JOIN against a guaranteed one-row `photographers` base. This
   migration brings get_signup_pages_by_token in line with that same,
   already-correct pattern. Nothing else about the RPC changes.

2. MODIFIED tests/e2e/client/all-sessions-booking.spec.js -- two changes:
   - Fixes a PRE-EXISTING test ("exactly one active session redirects...")
     that the full-suite audit caught failing: BookingHero.jsx keeps both
     its mobile and desktop layouts in the DOM at once (a lg: breakpoint
     just toggles which is visible via CSS), so a bare getByText('Only
     Active Page') matches both and trips Playwright's strict mode. Scopes
     to the desktop rail via the booking-hero-desktop testid step 13 added
     -- this bug has existed since step 4's desktop-rail redesign, just
     never caught until this was the first time the full suite ran since.
   - Adds a new test for the sql/063 fix above: a photographer with no
     enabled microsite still shows their own account name in the chooser
     header.

3. MODIFIED tests/e2e/client/booking-branding-and-covers.spec.js -- fixes
   the other failure the first run turned up: the "no enabled microsite"
   test asserted --bk-bg's literal value is the token string 'var(--bg)',
   on the theory that a custom property's computed value keeps var()
   references unresolved. Chrome doesn't actually do that in practice (it
   resolves nested var() when you read a custom property via
   getComputedStyle) -- confirmed by the actual failure, not just a spec
   reading. Now compares --bk-bg against --bg read on the same element
   instead of a hardcoded string, which is correct regardless of resolution
   behavior or the app's own light/dark default.

Run from the repo root, after steps 1 through 13. Idempotent -- safe to
run twice.

Next steps:
  1. Run sql/063_all_sessions_branding_fallback_fix.sql in the Supabase
     SQL editor.
  2. Re-run the two client specs:
       npx playwright test booking-branding-and-covers.spec.js all-sessions-booking.spec.js --project=chromium
     and confirm everything passes now, including the two new tests.
  3. Run the full suite to completion:
       npx playwright test --project=chromium
     Note the first full run got interrupted after 8/448 tests on an
     unrelated admin/user-management.spec.js failure ("creates a new
     storage tier", Admin Panel heading not found) -- that's nowhere near
     anything this series touches, so it's worth a separate look, but
     let's get a real full-suite result on the booking side first.
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


# ── 1. NEW sql/063 -- fix the dead branding fallback ────────────────────────
write_file("sql/063_all_sessions_branding_fallback_fix.sql", '''-- 063_all_sessions_branding_fallback_fix.sql
--
-- Bug fix, found while writing Playwright coverage for the booking-redesign
-- arc (v1.5.11 step 13): get_signup_pages_by_token's `branding` subquery
-- had a dead ELSE branch. It read:
--
--   SELECT CASE WHEN m.id IS NOT NULL THEN {...} ELSE {...} END
--   FROM microsites m
--   WHERE m.photographer_id = v_photographer.id AND m.enabled = true
--
-- With a plain FROM/WHERE (no join), a photographer with no enabled
-- microsite matches zero rows -- so the CASE never runs at all, and the
-- whole subquery returns SQL NULL rather than the ELSE branch's
-- `has_microsite: false` fallback object. The frontend's own
-- `data?.branding || { has_microsite: false, studio_name: null, ... }`
-- masks this well enough that nothing looked broken (the chooser still
-- shows the correct default indigo look), but it meant a photographer
-- without an enabled microsite NEVER got their own account name/logo
-- shown in the /book/all/:token header -- unlike the single-page
-- /book/:token RPC (get_signup_page_data), which already gets this right
-- via a LEFT JOIN against a guaranteed one-row `photographers` base:
--
--   FROM photographers p
--   LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
--   WHERE p.id = v_page.photographer_id
--
-- This migration brings get_signup_pages_by_token's branding subquery in
-- line with that same, already-correct pattern. Nothing else about this
-- RPC changes -- the cover_pattern/cover_image_r2_key/cover_focus_x/
-- cover_focus_y fields sql/062 added to each signup page stay exactly as
-- they were.
--
-- Run after: 062_all_sessions_cover_images.sql
-- Run this whole file in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION get_signup_pages_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_photographer photographers%ROWTYPE;
BEGIN
  SELECT * INTO v_photographer
  FROM photographers
  WHERE all_sessions_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'type', 'found',
    'business_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        jsonb_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, v_photographer.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
          'theme', m.theme,
          'accent_color', m.accent_color,
          'font_pairing', m.font_pairing,
          'custom_display_font', m.custom_display_font,
          'custom_body_font', m.custom_body_font,
          'radius', m.radius
        )
      ELSE
        jsonb_build_object(
          'has_microsite', false,
          'studio_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', v_photographer.logo_r2_key
        )
      END
      FROM photographers p
      LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
      WHERE p.id = v_photographer.id
    ),
    'signup_pages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'token', sp.token,
        'title', sp.title,
        'venue_address', sp.venue_address,
        'timezone', sp.timezone,
        'earliest_open_slot', earliest.start_time,
        'latest_open_slot', latest.start_time,
        'cover_pattern', sp.cover_pattern,
        'cover_image_r2_key', sp.cover_image_r2_key,
        'cover_focus_x', sp.cover_focus_x,
        'cover_focus_y', sp.cover_focus_y
      ) ORDER BY earliest.start_time ASC NULLS LAST, sp.created_at ASC)
      FROM signup_pages sp
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time ASC LIMIT 1
      ) earliest ON true
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time DESC LIMIT 1
      ) latest ON true
      WHERE sp.photographer_id = v_photographer.id AND sp.is_active = true
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
''')

# ── 2. all-sessions-booking.spec.js -- fix + new regression test ───────────
patch_file("tests/e2e/client/all-sessions-booking.spec.js", [
    (
        '''async function getPhotographer() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  const { data, error } = await sb().from('photographers').select('id, all_sessions_token').eq('id', user.id).single()
  if (error) throw new Error(error.message)
  if (!data.all_sessions_token) throw new Error('Test photographer has no all_sessions_token -- has migration 055 been run?')
  return data
}

async function createSignupPage(photographerId, overrides = {}) {''',
        '''async function getPhotographer() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  const { data, error } = await sb().from('photographers').select('id, all_sessions_token').eq('id', user.id).single()
  if (error) throw new Error(error.message)
  if (!data.all_sessions_token) throw new Error('Test photographer has no all_sessions_token -- has migration 055 been run?')
  return data
}

// Snapshot/restore the account's one-row `microsites` table around a test
// -- same pattern booking-branding-and-covers.spec.js's own withMicrosite
// duplicates fixtures.js's testMicrosite fixture for, for the same reason
// (importing fixtures.js's `test` would also pull in its pre-authenticated
// `page` fixture, wrong for these public, logged-out booking pages).
async function withMicrosite(photographerId, overrides, fn) {
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

async function createSignupPage(photographerId, overrides = {}) {''',
        1,
    ),
    (
        '''      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      // Lands on the single page's own booking flow, not the chooser.
      await expect(page).toHaveURL(new RegExp(`/book/${signupPage.token}$`))
      await expect(page.getByText('Only Active Page')).toBeVisible()''',
        '''      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      // Lands on the single page's own booking flow, not the chooser.
      await expect(page).toHaveURL(new RegExp(`/book/${signupPage.token}$`))
      // That page renders its title into BOTH the mobile and desktop hero
      // layouts at once (BookingHero.jsx keeps both in the DOM, toggling
      // which is visible via a lg: breakpoint) -- a bare getByText match
      // is ambiguous (Playwright's strict mode) even though only one is
      // actually visible. Scope to the desktop rail, since this repo's
      // Playwright gate only runs the chromium project at a >=1024px
      // viewport, same reasoning booking-branding-and-covers.spec.js
      // documents for its own [data-testid="booking-hero-desktop"] use.
      await expect(page.getByTestId('booking-hero-desktop').getByText('Only Active Page')).toBeVisible()''',
        1,
    ),
    (
        '''      // The old generic camera icon every row used to share is gone now
      // that each card leads with its own real cover.
      await expect(page.locator('svg.lucide-camera')).toHaveCount(0)
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(patternPage.id)
      await cleanupSignupPage(photoPage.id)
    }
  })
})''',
        '''      // The old generic camera icon every row used to share is gone now
      // that each card leads with its own real cover.
      await expect(page.locator('svg.lucide-camera')).toHaveCount(0)
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(patternPage.id)
      await cleanupSignupPage(photoPage.id)
    }
  })

  // Regression coverage for sql/063_all_sessions_branding_fallback_fix.sql:
  // get_signup_pages_by_token's `branding` subquery used to be written as a
  // plain FROM/WHERE against `microsites` (no join), which meant a
  // photographer with no enabled microsite matched zero rows -- so the
  // subquery's CASE never ran at all, and `branding` came back as SQL NULL
  // instead of its intended has_microsite:false fallback object (complete
  // with the account's own studio name/logo). The frontend's own
  // `data?.branding || {...}` default masked this well enough that the
  // page still LOOKED right (same default indigo colors either way) --
  // just silently missing the account name in the header. Mirrors the RPC's
  // own COALESCE(business_name, display_name), same reasoning
  // formatSessionDates()'s own mirror-the-component-logic comment
  // documents, rather than hardcoding the test account's real name.
  test('no enabled microsite still shows the account\\'s own name in the chooser header', async ({ page }) => {
    const photographer = await getPhotographer()
    await withMicrosite(photographer.id, { enabled: false }, async () => {
      const { data: photographerRow, error } = await sb().from('photographers')
        .select('business_name, display_name').eq('id', photographer.id).single()
      if (error) throw new Error(error.message)
      const expectedName = photographerRow.business_name || photographerRow.display_name

      const pageA = await createSignupPage(photographer.id, { title: 'Fallback Branding Page A' })
      const shootTypeA = await createShootType(pageA.id)
      const slotA = futureSlot(5)
      await createSlot(pageA.id, shootTypeA.id, slotA.start.toISOString(), slotA.end.toISOString())
      const pageB = await createSignupPage(photographer.id, { title: 'Fallback Branding Page B' })
      const shootTypeB = await createShootType(pageB.id)
      const slotB = futureSlot(9)
      await createSlot(pageB.id, shootTypeB.id, slotB.start.toISOString(), slotB.end.toISOString())

      const parked = await deactivateOtherActivePages(photographer.id, [pageA.id, pageB.id])
      try {
        await page.goto(`/book/all/${photographer.all_sessions_token}`)
        await waitForReady(page)
        await expect(page.getByText('Choose a session to book')).toBeVisible()
        if (expectedName) {
          await expect(page.getByText(expectedName)).toBeVisible()
        }
      } finally {
        await reactivatePages(parked)
        await cleanupSignupPage(pageA.id)
        await cleanupSignupPage(pageB.id)
      }
    })
  })
})''',
        1,
    ),
])

# ── 3. booking-branding-and-covers.spec.js -- fix the --bg assertion ───────
patch_file("tests/e2e/client/booking-branding-and-covers.spec.js", [
    (
        '''        expect(await readBkVar(page, '--bk-accent')).toBe('#6366f1')
        expect(await readBkVar(page, '--bk-bg')).toBe('var(--bg)')''',
        '''        expect(await readBkVar(page, '--bk-accent')).toBe('#6366f1')
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
        expect(await readBkVar(page, '--bk-bg')).toBe(await readBkVar(page, '--bg'))''',
        1,
    ),
])
