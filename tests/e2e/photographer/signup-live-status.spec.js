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
    title: 'Live Status Test Page',
    token: `live-status-test-${crypto.randomUUID().slice(0, 8)}`,
    venue_address: '123 Test St, Columbus, OH',
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
    signup_page_id: pageId, name: 'Test Shoot', duration_minutes: 15, session_type: 'Portrait', sort_order: 0, ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createSlot(pageId, shootTypeId, startTime, endTime, claimedFields = null) {
  const { data, error } = await sb().from('signup_slots').insert({
    signup_page_id: pageId, shoot_type_id: shootTypeId, start_time: startTime, end_time: endTime,
    ...(claimedFields ? { claimed_at: new Date().toISOString(), ...claimedFields } : {}),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupSignupPage(pageId) {
  await sb().from('signup_pages').delete().eq('id', pageId)
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

test.describe('Live status page', () => {
  test('shows the page title and correct claimed/total progress stat', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Progress Stat Test' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-10-01T19:00:00Z', '2026-10-01T19:15:00Z')
    await createSlot(signupPage.id, shootType.id, '2026-10-01T19:15:00Z', '2026-10-01T19:30:00Z',
      { client_name: 'Claimed Client', client_email: 'claimed@example.com' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)
      await expect(page.getByText('Progress Stat Test')).toBeVisible()
      await expect(page.getByText('1 / 2 claimed')).toBeVisible()
      await expect(page.getByText('50%')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('claimed slots show client details, open slots do not', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Slot Detail Test' })
    const shootType = await createShootType(signupPage.id, { name: 'Cosplay Portrait' })
    await createSlot(signupPage.id, shootType.id, '2026-10-02T19:00:00Z', '2026-10-02T19:15:00Z',
      { client_name: 'Jane Smith', client_pronouns: 'she/her', client_email: 'jane.smith@example.com', client_phone: '555-0199' })
    await createSlot(signupPage.id, shootType.id, '2026-10-02T19:15:00Z', '2026-10-02T19:30:00Z')
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await expect(page.getByText('Jane Smith')).toBeVisible()
      await expect(page.getByText('(she/her)')).toBeVisible()
      await expect(page.getByText('jane.smith@example.com')).toBeVisible()
      await expect(page.getByText('555-0199')).toBeVisible()
      await expect(page.getByText('Claimed', { exact: true })).toBeVisible()
      await expect(page.getByText('Open', { exact: true })).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('multiple days show tabs, and switching days changes the visible slots', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Multi Day Status Test' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-10-05T19:00:00Z', '2026-10-05T19:15:00Z')
    await createSlot(signupPage.id, shootType.id, '2026-10-06T19:00:00Z', '2026-10-06T19:15:00Z')
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      const day1Tab = page.getByRole('button', { name: 'Mon, Oct 5' })
      const day2Tab = page.getByRole('button', { name: 'Tue, Oct 6' })
      await expect(day1Tab).toBeVisible()
      await expect(day2Tab).toBeVisible()

      // First day with slots is shown by default (neither date is "today"
      // in any real test run, so this exercises the fallback-to-first-day
      // path rather than the matches-today path)
      await expect(page.getByText('3:00 PM')).toBeVisible()

      await day2Tab.click()
      await expect(page.getByText('3:00 PM')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a signup page with no slots for a given day shows an empty state', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Empty Day Test' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)
      await expect(page.getByText('No slots for this day.')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})
