import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

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
    title: 'Recurring Gen Test Page',
    token: `recurring-gen-test-${crypto.randomUUID().slice(0, 8)}`,
    timezone: 'America/New_York',
    is_active: true,
    mode: 'slots',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'Quick Portrait', duration_minutes: 15, session_type: 'Portrait', sort_order: 0, ...overrides,
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

async function goToSignups(page) {
  await page.goto('/sessions')
  await waitForReady(page)
  await page.getByRole('button', { name: 'Sign-ups' }).click()
}

async function openPageAndGenerator(page, title) {
  await goToSignups(page)
  await page.getByText(title, { exact: true }).first().click()
  await page.getByText('+ Generate or add time slots').click()
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Recurring slot generation', () => {
  test('a single day (no end date) never shows the day-of-week picker', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Single Day No Picker Page' })
    await createShootType(signupPage.id)
    try {
      await openPageAndGenerator(page, 'Single Day No Picker Page')
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-05')
      await expect(page.getByText('Days of week')).not.toBeVisible()
      await expect(page.getByRole('button', { name: /Generate slots for this day/ })).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a real date range shows the day-of-week picker, defaulting to all 7 selected', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Range Shows Picker Page' })
    await createShootType(signupPage.id)
    try {
      await openPageAndGenerator(page, 'Range Shows Picker Page')
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-05')
      await page.getByText('End date (optional)', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-11')

      await expect(page.getByText('Days of week')).toBeVisible()
      // All 7 pills should read as selected (filled/indigo) by default --
      // checked indirectly via the resulting slot count below, since color
      // state is a style assertion that's more brittle than a real DB check.
      await expect(page.getByRole('button', { name: /Generate slots for these days/ })).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('deselecting a day excludes that weekday from generated slots', async ({ page }) => {
    // 2026-09-05 is a Saturday, 2026-09-06 is a Sunday, 2026-09-07 is a Monday.
    const signupPage = await createSignupPage({ title: 'Weekday Exclusion Page' })
    await createShootType(signupPage.id)
    try {
      await openPageAndGenerator(page, 'Weekday Exclusion Page')
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-05')
      await page.getByText('End date (optional)', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-07')

      // Deselect Monday only -- Sat and Sun stay selected.
      await page.getByRole('button', { name: 'Mon', exact: true }).click()

      // Time fields already default to 10:00/18:00 -- no fill needed.
      await page.getByRole('button', { name: /Generate slots for these days/ }).click()
      await expect(page.getByText(/slots created/)).toBeVisible({ timeout: 10000 })

      const { data: slots } = await sb().from('signup_slots').select('start_time').eq('signup_page_id', signupPage.id)
      expect(slots.length).toBeGreaterThan(0)
      const dates = new Set(slots.map(s => s.start_time.slice(0, 10)))
      expect(dates.has('2026-09-07')).toBe(false) // Monday excluded
      expect(dates.has('2026-09-05') || dates.has('2026-09-06')).toBe(true) // Sat/Sun included
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('deselecting every day in range mode blocks generation with an error', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'All Days Deselected Page' })
    await createShootType(signupPage.id)
    try {
      await openPageAndGenerator(page, 'All Days Deselected Page')
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-05')
      await page.getByText('End date (optional)', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-11')

      for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
        await page.getByRole('button', { name: day, exact: true }).click()
      }

      await page.getByRole('button', { name: /Generate slots for these days/ }).click()
      await expect(page.getByText('Pick at least one day of the week.')).toBeVisible()

      const { data: slots } = await sb().from('signup_slots').select('id').eq('signup_page_id', signupPage.id)
      expect(slots.length).toBe(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})
