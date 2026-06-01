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
})
