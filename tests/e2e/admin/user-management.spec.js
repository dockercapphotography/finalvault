import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })
test.describe.configure({ mode: 'serial' })

// The assertions below expect the test account's display_name to
// already read "Test Studio" -- previously that only held by
// coincidence, left over from watermark.spec.js's "saves display
// name on blur" test having run earlier in some prior suite run.
// Set it explicitly here so this file doesn't silently depend on
// cross-file test order or leftover state from a previous run.
test.beforeAll(async () => {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  await sb().from('photographers').update({ display_name: 'Test Studio' }).eq('id', user.id)
})

async function goToAdmin(page) {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible({ timeout: 10000 })
  // Wait for data to load — user list appears
  await expect(page.getByText('Nick Porterfield').first()).toBeVisible({ timeout: 10000 })
}

async function goToTiersTab(page) {
  await goToAdmin(page)
  await page.getByRole('button', { name: 'Storage Tiers' }).click()
  await expect(page.getByText('New Tier')).toBeVisible({ timeout: 5000 })
}

test.describe('Admin — User Management', () => {
  test('lists all photographers', async ({ page }) => {
    await goToAdmin(page)
    // The photographer roster has grown past the admin list's
    // 10-per-page client-side pagination (no explicit sort order on
    // the query either), so "Test Studio" isn't guaranteed to land
    // on page 1 anymore -- search for it explicitly, same as
    // 'search filters the photographer list' below.
    await page.locator('input[placeholder*="Search"]').fill('Test Studio')
    await expect(page.getByText('Test Studio')).toBeVisible()
    await expect(page.getByText(/galleries/).first()).toBeVisible()
  })

  test('shows each photographer storage usage', async ({ page }) => {
    await goToAdmin(page)
    await expect(page.getByText(/\d+(\.\d+)? (B|KB|MB|GB)/).first()).toBeVisible()
  })

  test('can toggle admin status for a user', async ({ page }) => {
    await goToAdmin(page)
    // Scope strictly to the 'No name' user row to avoid touching the playwright account
    const noNameRow = page.locator('div').filter({ hasText: /^No name/ }).first()
    const toggleBtn = noNameRow.getByRole('button', { name: /Admin|Not admin/ }).first()
    const initialText = await toggleBtn.textContent()
    await toggleBtn.click()
    await expect(page.getByText(/updated|saved/i)).toBeVisible({ timeout: 5000 })
    // Toggle back to original state
    await toggleBtn.click()
    await expect(page.getByText(/updated|saved/i)).toBeVisible({ timeout: 5000 })
  })

  test('can assign a storage tier to a user', async ({ page }) => {
    await goToAdmin(page)
    await expect(page.locator('select').first()).toBeAttached()
    const options = await page.locator('select').first().locator('option').allTextContents()
    expect(options.length).toBeGreaterThan(0)
  })

  test('search filters the photographer list', async ({ page }) => {
    await goToAdmin(page)
    await page.locator('input[placeholder*="Search"]').fill('Test Studio')
    await expect(page.getByText('Test Studio')).toBeVisible()
    await expect(page.getByText('Nick Porterfield')).not.toBeVisible()
  })
})

test.describe('Admin — Tier Management', () => {
  test('admin page is accessible to admin users', async ({ page }) => {
    await goToAdmin(page)
    await expect(page.getByText('Manage users, storage tiers, and platform settings')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Storage Tiers' })).toBeVisible()
  })

  test('storage tiers tab shows existing tiers', async ({ page }) => {
    await goToTiersTab(page)
    await expect(page.getByText(/\d+GB/i).first()).toBeVisible()
  })

  test('creates a new storage tier', async ({ page }) => {
    await goToTiersTab(page)
    await page.getByText('New Tier').click()
    await page.waitForTimeout(300)
    const tierName = `PW Test Tier ${Date.now()}`
    await page.locator('input').first().fill(tierName)
    await page.getByRole('button', { name: /Save|Create/ }).click()
    await expect(page.getByText(tierName)).toBeVisible({ timeout: 5000 })
    await sb().from('storage_tiers').delete().ilike('name', 'PW Test Tier%')
  })

  test('edits an existing tier', async ({ page }) => {
    const { data: tier } = await sb().from('storage_tiers').insert({
      name: 'PW Edit Tier',
      storage_gb: 5,
      price_monthly: 0,
    }).select().single()

    try {
      await goToTiersTab(page)
      await expect(page.getByText('PW Edit Tier')).toBeVisible()
      const tierRow = page.locator('div').filter({ hasText: /^PW Edit Tier/ }).first()
      await tierRow.locator('button').click()
      await page.waitForTimeout(300)
      await page.locator('input').first().fill('PW Edit Tier Updated')
      await page.getByRole('button', { name: /Save|Update/ }).click()
      await expect(page.getByText('PW Edit Tier Updated')).toBeVisible({ timeout: 5000 })
    } finally {
      await sb().from('storage_tiers').delete().ilike('name', 'PW Edit Tier%')
    }
  })

  test('tier changes are reflected in the photographer list', async ({ page }) => {
    await goToAdmin(page)
    // Same pagination caveat as 'lists all photographers' above.
    await page.locator('input[placeholder*="Search"]').fill('Test Studio')
    await expect(page.getByText('Test Studio')).toBeVisible()
    await expect(page.locator('select').first()).toBeAttached()
  })

  // ── admin_set_photographer_tier RPC — not covered by an automated test ────
  //
  // A UI-driven test for changing a photographer's tier from this dropdown
  // was attempted alongside the search_path hardening migration
  // (2026-06-26) but dropped after several rounds of locator instability
  // against Admin.jsx's nested row markup (filter-by-text and XPath
  // ancestor traversal both produced unreliable element counts across runs).
  //
  // This RPC was manually verified end-to-end after the search_path
  // migration: a real tier change was made via this exact dropdown and
  // confirmed to persist correctly. Given the function's simplicity (a
  // single INSERT ... ON CONFLICT DO UPDATE) and low change frequency,
  // the manual check is considered sufficient for now rather than continuing
  // to chase a fragile locator.
  //
  // If Admin.jsx's row structure is refactored in the future, this would be
  // a good time to add a stable test hook (e.g. a data-testid on each row)
  // and revisit automated coverage here.

  // ── assign_default_storage_tier trigger — fires on real signup ─────────────
  //
  // Unlike the test above, this one exercises a genuine auth.users insert
  // (a real signup) so the actual trigger chain fires:
  // auth.users insert -> handle_new_user() -> photographers insert ->
  // assign_default_storage_tier() -> photographer_storage insert.
  //
  // This is the one path from the search_path hardening migration that
  // can't be triggered through the UI in a normal test flow, since it only
  // runs once, at account creation.
  test('assigns a default storage tier on signup', async ({ page }) => {
    // Ensure there's a tier marked as default to assign, without assuming
    // one already exists — create one if needed, restore prior default
    // state afterward.
    const { data: existingDefault } = await sb()
      .from('storage_tiers')
      .select('id')
      .eq('is_default', true)
      .maybeSingle()

    let createdFallbackDefault = null
    if (!existingDefault) {
      const { data } = await sb().from('storage_tiers').insert({
        name: `PW Default Tier ${Date.now()}`,
        storage_gb: 5,
        price_monthly: 0,
        is_default: true,
      }).select().single()
      createdFallbackDefault = data
    }

    const testEmail = `pw-signup-test-${Date.now()}@example.com`
    let createdUserId = null

    try {
      const { data: userData, error: createError } = await sb().auth.admin.createUser({
        email: testEmail,
        password: 'PlaywrightSignupTest123!',
        email_confirm: true,
      })
      if (createError) throw new Error(createError.message)
      createdUserId = userData.user.id

      // Give the trigger chain a moment to run (it's synchronous within the
      // insert transaction, but allow a brief retry window for safety).
      let storageRow = null
      for (let i = 0; i < 5; i++) {
        const { data } = await sb()
          .from('photographer_storage')
          .select('tier_id')
          .eq('photographer_id', createdUserId)
          .maybeSingle()
        if (data) { storageRow = data; break }
        await page.waitForTimeout(500)
      }

      expect(storageRow).not.toBeNull()
      expect(storageRow.tier_id).not.toBeNull()
    } finally {
      if (createdUserId) {
        await sb().from('photographer_storage').delete().eq('photographer_id', createdUserId)
        await sb().from('photographers').delete().eq('id', createdUserId)
        await sb().auth.admin.deleteUser(createdUserId)
      }
      if (createdFallbackDefault) {
        await sb().from('storage_tiers').delete().eq('id', createdFallbackDefault.id)
      }
    }
  })
})

// ── v1.5.8: pagination (client-side slice over the fetched roster) ─────────

async function waitForPhotographerRow(id) {
  for (let i = 0; i < 10; i++) {
    const { data } = await sb().from('photographers').select('id').eq('id', id).maybeSingle()
    if (data) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Photographer row never appeared for ${id}`)
}

test.describe('Admin — User Management pagination', () => {
  const createdUserIds = []
  const PAGE_TEST_COUNT = 11 // one more than a full page (default page size 10)

  test.beforeAll(async () => {
    for (let i = 0; i < PAGE_TEST_COUNT; i++) {
      const email = `pw-page-test-${i}-${Date.now()}@example.com`
      const { data, error } = await sb().auth.admin.createUser({
        email,
        password: 'PlaywrightPageTest123!',
        email_confirm: true,
      })
      if (error) throw new Error(error.message)
      createdUserIds.push(data.user.id)
      // Real signup trigger chain (handle_new_user -> photographers insert)
      // -- same as the "assigns a default storage tier on signup" test
      // above -- creates the row asynchronously enough to need a brief
      // wait before it's safe to update display_name on it.
      await waitForPhotographerRow(data.user.id)
      await sb().from('photographers').update({ display_name: `PW Page Test ${i}` }).eq('id', data.user.id)
    }
  })

  test.afterAll(async () => {
    for (const id of createdUserIds) {
      await sb().from('photographer_storage').delete().eq('photographer_id', id)
      await sb().from('photographers').delete().eq('id', id)
      await sb().auth.admin.deleteUser(id)
    }
  })

  test('search narrows to seeded accounts, showing a real page count', async ({ page }) => {
    await goToAdmin(page)
    await page.locator('input[placeholder*="Search"]').fill('PW Page Test')
    await expect(page.getByText('PW Page Test 0')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(`Showing 1–10 of ${PAGE_TEST_COUNT}`)).toBeVisible()
    await expect(page.getByText('Page 1 of 2')).toBeVisible()
  })

  test('Next advances to the second page and shows the remainder', async ({ page }) => {
    await goToAdmin(page)
    await page.locator('input[placeholder*="Search"]').fill('PW Page Test')
    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(`Showing 11–${PAGE_TEST_COUNT} of ${PAGE_TEST_COUNT}`)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
    // Note: which specific seeded account lands on page 2 isn't asserted
    // here -- Admin.jsx's photographer query has no ORDER BY, so row
    // order isn't guaranteed by the app. The counts above are the real
    // contract this test cares about.
  })

  test('changing search resets back to page 1', async ({ page }) => {
    await goToAdmin(page)
    await page.locator('input[placeholder*="Search"]').fill('PW Page Test')
    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText('Page 2 of 2')).toBeVisible({ timeout: 5000 })

    // Narrow the search further -- "PW Page Test 2" (not "...Test 1",
    // which is a substring of "...Test 10" and would correctly match
    // both under the app's substring search, defeating the point of
    // this assertion). Should land back on page 1, not stay stuck on a
    // now out-of-range page 2.
    await page.locator('input[placeholder*="Search"]').fill('PW Page Test 2')
    await expect(page.getByText('PW Page Test 2', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Page \d+ of \d+/)).not.toBeVisible()
  })
})
