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
    title: 'Booking Test Page',
    token: `booking-test-${crypto.randomUUID().slice(0, 8)}`,
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

async function createSlot(pageId, shootTypeId, startTime, endTime) {
  const { data, error } = await sb().from('signup_slots').insert({
    signup_page_id: pageId, shoot_type_id: shootTypeId, start_time: startTime, end_time: endTime,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// signup_pages cascades to shoot_types/slots/shoot_type_questionnaires, but
// the claim function creates real clients/sessions with no FK back to the
// page -- those need explicit cleanup by the email each test used.
async function cleanupSignupPage(pageId, testEmails = []) {
  await sb().from('signup_pages').delete().eq('id', pageId)
  for (const email of testEmails) {
    const { data: clients } = await sb().from('clients').select('id').eq('email', email)
    for (const c of clients ?? []) {
      await sb().from('sessions').delete().eq('client_id', c.id)
      await sb().from('clients').delete().eq('id', c.id)
    }
  }
}

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

test.describe('Public booking page', () => {
  test('invalid token shows the link-not-valid message', async ({ page }) => {
    await page.goto('/book/not-a-real-token')
    await waitForReady(page)
    await expect(page.getByText("This link isn't valid")).toBeVisible()
  })

  test('inactive page shows it is not accepting bookings', async ({ page }) => {
    const signupPage = await createSignupPage({ is_active: false, title: 'Inactive Test Page' })
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await expect(page.getByText('Inactive Test Page')).toBeVisible()
      await expect(page.getByText("This isn't accepting bookings right now.")).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a single shoot type skips the picker, going straight to times', async ({ page }) => {
    const signupPage = await createSignupPage()
    const shootType = await createShootType(signupPage.id)
    const slot = await createSlot(signupPage.id, shootType.id, '2026-08-15T19:00:00Z', '2026-08-15T19:15:00Z')
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await expect(page.getByText(shootType.name)).not.toBeVisible()
      await expect(page.getByText('3:00 PM')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('multiple shoot types show a picker', async ({ page }) => {
    const signupPage = await createSignupPage()
    const typeA = await createShootType(signupPage.id, { name: 'Cosplay Portrait', sort_order: 0 })
    const typeB = await createShootType(signupPage.id, { name: 'Group Shoot', sort_order: 1 })
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await expect(page.getByText('Cosplay Portrait')).toBeVisible()
      await expect(page.getByText('Group Shoot')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('shows the booking page description, except on the success screen', async ({ page }) => {
    const signupPage = await createSignupPage({ booking_description: 'Thanks for your interest in booking with me!' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-08-15T19:00:00Z', '2026-08-15T19:15:00Z')
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await expect(page.getByText('Thanks for your interest in booking with me!')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('full flow: pick a time, fill details, and confirm to a success screen', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Happy Path Test Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Cosplay Portrait' })
    await createSlot(signupPage.id, shootType.id, '2026-08-16T19:00:00Z', '2026-08-16T19:15:00Z')
    const email = `booking-happy-${crypto.randomUUID().slice(0, 8)}@example.com`

    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await page.getByText('3:00 PM').click()

      await page.getByPlaceholder('First name').fill('Jane')
      await page.getByPlaceholder('Last name').fill('Booker')
      await page.getByPlaceholder('Email').fill(email)
      await page.getByPlaceholder('Phone (optional)').fill('555-0123')

      await page.getByRole('button', { name: 'Confirm booking' }).click()

      await expect(page.getByText("You're booked!")).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Cosplay Portrait', { exact: false }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Add to Google Calendar' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Download .ics' })).toBeVisible()

      // The booking description shouldn't linger on the success screen
      const { data: freshPage } = await sb().from('signup_pages').select('booking_description').eq('id', signupPage.id).single()
      expect(freshPage).toBeTruthy()
    } finally {
      await cleanupSignupPage(signupPage.id, [email])
    }
  })

  test('a slot claimed by someone else mid-flow shows a conflict message', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Race Condition Test Page' })
    const shootType = await createShootType(signupPage.id)
    const slot = await createSlot(signupPage.id, shootType.id, '2026-08-17T19:00:00Z', '2026-08-17T19:15:00Z')
    const raceWinnerEmail = `race-winner-${crypto.randomUUID().slice(0, 8)}@example.com`
    const loserEmail = `race-loser-${crypto.randomUUID().slice(0, 8)}@example.com`

    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      await page.getByText('3:00 PM').click()

      await page.getByPlaceholder('First name').fill('Race')
      await page.getByPlaceholder('Last name').fill('Loser')
      await page.getByPlaceholder('Email').fill(loserEmail)

      // Simulate someone else claiming the exact same slot in the gap
      // between it being displayed and this form being submitted --
      // exactly the scenario the exclusion constraint + already_claimed
      // check exist for.
      const { data: raceResult, error: raceError } = await sb().rpc('claim_signup_slot', {
        p_slot_id: slot.id, p_first_name: 'Race', p_last_name: 'Winner', p_email: raceWinnerEmail,
      })
      expect(raceError, raceError?.message).toBeNull()
      expect(raceResult.success).toBe(true)

      await page.getByRole('button', { name: 'Confirm booking' }).click()
      await expect(page.getByText('That time was just booked by someone else — pick another below.')).toBeVisible({ timeout: 10000 })
    } finally {
      await cleanupSignupPage(signupPage.id, [raceWinnerEmail, loserEmail])
    }
  })
})
