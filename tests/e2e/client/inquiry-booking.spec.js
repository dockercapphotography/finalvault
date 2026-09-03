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
    title: 'Inquiry Booking Test Page',
    token: `inquiry-booking-test-${crypto.randomUUID().slice(0, 8)}`,
    timezone: 'America/New_York',
    is_active: true,
    mode: 'inquiry',
    buffer_minutes: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'Grad Portrait', duration_minutes: 60, session_type: 'Portrait', sort_order: 0, ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// September 2026: Sat/Sun fall on 5,6 / 12,13 / 19,20 / 26,27 -- picking
// a full month keeps every test's window unambiguous and independent of
// whenever the suite actually runs.
async function createWindow(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_inquiry_windows').insert({
    signup_page_id: pageId,
    days_of_week: [6], // Saturday only
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    start_time: '13:00:00',
    end_time: '17:00:00',
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupSignupPage(pageId, testEmails = []) {
  await sb().from('sessions').delete().eq('signup_page_id', pageId)
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

test.describe('Public inquiry booking page — calendar', () => {
  test('only eligible weekdays within the window range are clickable', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Calendar Eligibility Page' })
    const shootType = await createShootType(signupPage.id)
    await createWindow(signupPage.id)
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      // A single shoot type auto-skips the picker step (same behavior
      // slot-based pages already have) -- straight to the calendar.

      // Sept 1, 2026 is a Tuesday -- outside the Saturday-only window.
      await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled()
      // Sept 5, 2026 is the first Saturday in range.
      await expect(page.getByRole('button', { name: '5', exact: true })).toBeEnabled()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('picking a date offers only times where the full session fits inside the window', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Time Bounds Page' })
    const shootType = await createShootType(signupPage.id, { duration_minutes: 60 })
    await createWindow(signupPage.id) // 13:00-17:00
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      // A single shoot type auto-skips the picker step -- straight to the calendar.
      await page.getByRole('button', { name: '5', exact: true }).click()

      const select = page.locator('select')
      const optionTexts = await select.locator('option').allTextContents()
      // A 60-minute session must start by 4:00 PM to end by 5:00 PM.
      expect(optionTexts).toContain('4:00 PM')
      expect(optionTexts).not.toContain('4:30 PM')
      expect(optionTexts).not.toContain('5:00 PM')
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a day at the daily cap is excluded from the calendar', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Daily Cap Page', max_daily_inquiries: 1 })
    const shootType = await createShootType(signupPage.id)
    await createWindow(signupPage.id)
    const photographerId = await getPhotographerId()
    const { data: client } = await sb().from('clients').insert({
      photographer_id: photographerId, first_name: 'Cap', last_name: 'Filler', email: `cap-filler-${crypto.randomUUID().slice(0, 8)}@example.com`,
    }).select().single()
    await sb().from('sessions').insert({
      photographer_id: photographerId, client_id: client.id, name: 'Cap filler session',
      type: 'Portrait', mode: 'private', status: 'inquiry',
      session_date: '2026-09-05', start_time: '13:00:00', end_time: '14:00:00',
      signup_page_id: signupPage.id, submit_token: crypto.randomUUID().replace(/-/g, ''),
    })
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      // A single shoot type auto-skips the picker step -- straight to the calendar.
      await expect(page.getByRole('button', { name: '5', exact: true })).toBeDisabled()
    } finally {
      await sb().from('clients').delete().eq('id', client.id)
      await cleanupSignupPage(signupPage.id)
    }
  })
})

test.describe('Public inquiry booking page — submission', () => {
  test('full flow: pick a date/time, fill details, submit to a success screen', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Inquiry Happy Path Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Grad Portrait' })
    await createWindow(signupPage.id)
    const email = `inquiry-happy-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await page.goto(`/book/${signupPage.token}`)
      await waitForReady(page)
      // A single shoot type auto-skips the picker step -- straight to the calendar.
      await page.getByRole('button', { name: '5', exact: true }).click()
      await page.locator('select').selectOption('13:00')
      await page.getByRole('button', { name: 'Continue' }).click()

      await page.getByPlaceholder('First name').fill('Jane')
      await page.getByPlaceholder('Last name').fill('Grad')
      await page.getByPlaceholder('Email').fill(email)
      await page.getByRole('button', { name: 'Send inquiry' }).click()

      await expect(page.getByText('Inquiry sent!')).toBeVisible({ timeout: 10000 })

      const { data: client } = await sb().from('clients').select('id').eq('email', email).single()
      const { data: sessions } = await sb().from('sessions').select('*').eq('client_id', client.id)
      expect(sessions.length).toBe(1)
      expect(sessions[0].status).toBe('inquiry')
      expect(sessions[0].signup_page_id).toBe(signupPage.id)
      expect(sessions[0].session_date).toBe('2026-09-05')
      expect(sessions[0].start_time).toBe('13:00:00')
    } finally {
      await cleanupSignupPage(signupPage.id, [email])
    }
  })
})

test.describe('submit_signup_inquiry RPC — server-side enforcement', () => {
  test('rejects a request outside every window', async () => {
    const signupPage = await createSignupPage({ title: 'RPC Outside Window Page' })
    const shootType = await createShootType(signupPage.id)
    await createWindow(signupPage.id) // Saturdays only
    try {
      // Sept 1, 2026 is a Tuesday -- not in the window's days_of_week.
      const { data } = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-01', p_time: '13:00:00',
        p_first_name: 'Outside', p_last_name: 'Window', p_email: 'outside-window@example.com',
      })
      expect(data.success).toBe(false)
      expect(data.error).toBe('outside_window')
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('rejects a second overlapping submission for the same page/date (buffer enforcement)', async () => {
    const signupPage = await createSignupPage({ title: 'RPC Overlap Page', buffer_minutes: 15 })
    const shootType = await createShootType(signupPage.id, { duration_minutes: 60 })
    await createWindow(signupPage.id)
    const emailA = `rpc-overlap-a-${crypto.randomUUID().slice(0, 8)}@example.com`
    const emailB = `rpc-overlap-b-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const first = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '13:00:00',
        p_first_name: 'First', p_last_name: 'Booker', p_email: emailA,
      })
      expect(first.data.success).toBe(true)

      // 13:45 is within the 15-minute buffer of the first session's 14:00 end.
      const second = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '13:45:00',
        p_first_name: 'Second', p_last_name: 'Booker', p_email: emailB,
      })
      expect(second.data.success).toBe(false)
      expect(second.data.error).toBe('time_conflict')

      // 14:15 clears the buffer (15 min after the first session's 14:00 end).
      const third = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '14:15:00',
        p_first_name: 'Third', p_last_name: 'Booker', p_email: `rpc-overlap-c-${crypto.randomUUID().slice(0, 8)}@example.com`,
      })
      expect(third.data.success).toBe(true)
    } finally {
      await cleanupSignupPage(signupPage.id, [emailA, emailB])
    }
  })

  test('rejects once the daily cap is reached', async () => {
    const signupPage = await createSignupPage({ title: 'RPC Daily Cap Page', max_daily_inquiries: 1 })
    const shootType = await createShootType(signupPage.id, { duration_minutes: 30 })
    await createWindow(signupPage.id)
    const emailA = `rpc-cap-a-${crypto.randomUUID().slice(0, 8)}@example.com`
    const emailB = `rpc-cap-b-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const first = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '13:00:00',
        p_first_name: 'Cap', p_last_name: 'First', p_email: emailA,
      })
      expect(first.data.success).toBe(true)

      // Far enough from the first session to rule out a buffer/overlap
      // rejection -- this must fail specifically because the day is full.
      const second = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '16:00:00',
        p_first_name: 'Cap', p_last_name: 'Second', p_email: emailB,
      })
      expect(second.data.success).toBe(false)
      expect(second.data.error).toBe('day_full')
    } finally {
      await cleanupSignupPage(signupPage.id, [emailA, emailB])
    }
  })

  test('moving a session off the capped date frees it back up for new inquiries', async () => {
    // The exact scenario Nick asked about directly: editing a session's
    // date should be reflected live on the next check, since neither the
    // cap nor the overlap check is a snapshot -- both query the live
    // sessions table.
    const signupPage = await createSignupPage({ title: 'RPC Reopen Page', max_daily_inquiries: 1 })
    const shootType = await createShootType(signupPage.id, { duration_minutes: 30 })
    await createWindow(signupPage.id)
    const emailA = `rpc-reopen-a-${crypto.randomUUID().slice(0, 8)}@example.com`
    const emailB = `rpc-reopen-b-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const first = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '13:00:00',
        p_first_name: 'Reopen', p_last_name: 'First', p_email: emailA,
      })
      expect(first.data.success).toBe(true)

      // Simulate the photographer moving that session to a different date.
      await sb().from('sessions').update({ session_date: '2026-09-12' }).eq('id', first.data.session_id)

      const second = await sb().rpc('submit_signup_inquiry', {
        p_token: signupPage.token, p_shoot_type_id: shootType.id,
        p_date: '2026-09-05', p_time: '13:00:00',
        p_first_name: 'Reopen', p_last_name: 'Second', p_email: emailB,
      })
      expect(second.data.success).toBe(true)
    } finally {
      await cleanupSignupPage(signupPage.id, [emailA, emailB])
    }
  })
})
