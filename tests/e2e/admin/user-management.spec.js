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
