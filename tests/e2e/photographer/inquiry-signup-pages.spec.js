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
    title: 'Inquiry Setup Test Page',
    token: `inquiry-setup-test-${crypto.randomUUID().slice(0, 8)}`,
    timezone: 'America/New_York',
    is_active: true,
    mode: 'inquiry',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'Grad Portrait', duration_minutes: 30, session_type: 'Portrait', sort_order: 0, ...overrides,
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

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Creating an inquiry-mode signup page', () => {
  test('choosing Inquiry at creation sets mode=inquiry and the tab reads Availability', async ({ page }) => {
    const title = `New Inquiry Page ${crypto.randomUUID().slice(0, 8)}`
    let createdPageId
    try {
      await goToSignups(page)
      await page.getByRole('button', { name: 'New signup page' }).first().click()
      await page.getByPlaceholder('GenCon 2026 Photo Sessions').fill(title)
      await page.getByRole('button', { name: 'Inquiry', exact: false }).click()
      await page.getByRole('button', { name: 'Create', exact: true }).click()

      await expect(page.getByRole('button', { name: 'Availability' })).toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('signup_pages').select('id, mode').eq('title', title).single()
      createdPageId = data.id
      expect(data.mode).toBe('inquiry')
    } finally {
      if (createdPageId) await cleanupSignupPage(createdPageId)
    }
  })

  test('choosing Fixed time slots keeps the tab reading Booking slots', async ({ page }) => {
    const title = `New Slots Page ${crypto.randomUUID().slice(0, 8)}`
    let createdPageId
    try {
      await goToSignups(page)
      await page.getByRole('button', { name: 'New signup page' }).first().click()
      await page.getByPlaceholder('GenCon 2026 Photo Sessions').fill(title)
      // Slots is the default -- no need to click it explicitly, but doing
      // so anyway keeps this test resilient if the default ever changes.
      await page.getByRole('button', { name: 'Fixed time slots', exact: false }).click()
      await page.getByRole('button', { name: 'Create', exact: true }).click()

      await expect(page.getByRole('button', { name: 'Booking slots' })).toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('signup_pages').select('id, mode').eq('title', title).single()
      createdPageId = data.id
      expect(data.mode).toBe('slots')
    } finally {
      if (createdPageId) await cleanupSignupPage(createdPageId)
    }
  })
})

test.describe('Availability windows editor', () => {
  test('adding a window creates a real row with the chosen days/dates/times', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Add Window Page' })
    await createShootType(signupPage.id)
    try {
      await goToSignups(page)
      await page.getByText('Add Window Page', { exact: true }).click()
      await page.getByRole('button', { name: '+ Add window' }).click()

      // A new window defaults to Sun+Sat already selected -- no clicks
      // needed here, just the dates/times.
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-01')
      await page.getByText('End date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-30')
      await page.locator('input[type="time"]').first().fill('13:00')
      await page.locator('input[type="time"]').nth(1).fill('17:00')
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      // Rendered in DAYS_OF_WEEK order (Sun, Mon, ... Sat), not selection order.
      await expect(page.getByText('Sun, Sat', { exact: false })).toBeVisible({ timeout: 5000 })

      const { data: windows } = await sb().from('signup_inquiry_windows').select('*').eq('signup_page_id', signupPage.id)
      expect(windows.length).toBe(1)
      expect(windows[0].days_of_week.sort()).toEqual([0, 6])
      expect(windows[0].start_date).toBe('2026-09-01')
      expect(windows[0].end_date).toBe('2026-09-30')
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a page can have multiple windows with different patterns', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Multi Window Page' })
    await createShootType(signupPage.id)
    await sb().from('signup_inquiry_windows').insert({
      signup_page_id: signupPage.id, days_of_week: [6, 0], start_date: '2026-04-01', end_date: '2026-04-30',
      start_time: '10:00:00', end_time: '14:00:00',
    })
    try {
      await goToSignups(page)
      await page.getByText('Multi Window Page', { exact: true }).click()

      await page.getByRole('button', { name: '+ Add window' }).click()
      // A new window defaults to Sun+Sat already selected -- no clicks needed.
      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-05-01')
      await page.getByText('End date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-05-31')
      await page.locator('input[type="time"]').first().fill('11:00')
      await page.locator('input[type="time"]').nth(1).fill('15:00')
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByRole('button', { name: '+ Add window' })).toBeVisible({ timeout: 5000 })
      const { data: windows } = await sb().from('signup_inquiry_windows').select('*').eq('signup_page_id', signupPage.id)
      expect(windows.length).toBe(2)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('editing a window updates it in place, removing it deletes the row', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Edit Remove Window Page' })
    await createShootType(signupPage.id)
    await sb().from('signup_inquiry_windows').insert({
      signup_page_id: signupPage.id, days_of_week: [6], start_date: '2026-04-01', end_date: '2026-04-30',
      start_time: '10:00:00', end_time: '14:00:00',
    })
    try {
      await goToSignups(page)
      await page.getByText('Edit Remove Window Page', { exact: true }).click()

      await page.getByRole('button', { name: 'Window actions' }).click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      // Existing window only has Sat selected -- clicking Sun here genuinely
      // adds it (unlike the new-window tests, where Sun+Sat start pre-selected).
      await page.getByRole('button', { name: 'Sun', exact: true }).click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      // Rendered in DAYS_OF_WEEK order (Sun, Mon, ... Sat).
      await expect(page.getByText('Sun, Sat', { exact: false })).toBeVisible({ timeout: 5000 })

      await page.getByRole('button', { name: 'Window actions' }).click()
      await page.getByRole('button', { name: 'Remove', exact: true }).click()
      await page.getByRole('button', { name: 'Remove', exact: true }).click() // confirm

      await expect(page.getByText("No windows yet")).toBeVisible({ timeout: 5000 })
      const { data: remaining } = await sb().from('signup_inquiry_windows').select('id').eq('signup_page_id', signupPage.id)
      expect(remaining.length).toBe(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})

test.describe('Buffer and daily cap settings', () => {
  test('setting a buffer and a daily cap persists to the page', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Buffer Cap Page' })
    await createShootType(signupPage.id)
    try {
      await goToSignups(page)
      await page.getByText('Buffer Cap Page', { exact: true }).click()

      await page.getByText('Buffer between requests (minutes)', { exact: true })
        .locator('xpath=following-sibling::input[1]').fill('20')
      await page.keyboard.press('Tab')
      await page.getByText('Max inquiries per day (optional)', { exact: true })
        .locator('xpath=following-sibling::input[1]').fill('3')
      await page.keyboard.press('Tab')

      await page.waitForTimeout(500)
      const { data } = await sb().from('signup_pages').select('buffer_minutes, max_daily_inquiries').eq('id', signupPage.id).single()
      expect(data.buffer_minutes).toBe(20)
      expect(data.max_daily_inquiries).toBe(3)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})
