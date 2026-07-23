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

// claim_signup_slot creates real clients/sessions with no FK back to the
// signup page, so cleaning up the page alone (above) doesn't remove them --
// same reasoning as signup-booking.spec.js's cleanupSignupPage(pageId,
// testEmails). Needed for the walk-up registration tests below, since
// registering a walk-up from Live Status calls that exact same RPC.
async function cleanupClientsByEmail(emails) {
  for (const email of emails) {
    const { data: clients } = await sb().from('clients').select('id').eq('email', email)
    for (const c of clients ?? []) {
      await sb().from('sessions').delete().eq('client_id', c.id)
      await sb().from('clients').delete().eq('id', c.id)
    }
  }
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

      // .first() because the NowCard's "Next up" line (added in v1.5.2)
      // can also render this name, since every fixture date here is in
      // the future relative to whenever the suite actually runs.
      await expect(page.getByText('Jane Smith').first()).toBeVisible()
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
      // .first() for the same NowCard "Next up" collision reason as the
      // test above -- its "Next: ... at 3:00 PM (...)" text also
      // contains "3:00 PM" as a substring.
      await expect(page.getByText('3:00 PM').first()).toBeVisible()

      await day2Tab.click()
      await expect(page.getByText('3:00 PM').first()).toBeVisible()
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

// v1.5.2 additions. All of these exercise desktop-only UI (the anchored
// popover for slot actions, and the Modal for walk-up registration) --
// mobile gets a bottom sheet/sheet instead for both, decided by a
// useMediaQuery(768px) check in SignupLiveStatus.jsx. That's consistent
// with these tests only running on the chromium/firefox projects in the
// first place: playwright.config.js excludes photographer/ specs from the
// mobile-chrome and mobile-safari projects entirely, so there's no
// separate mobile-viewport coverage needed here for that split.
test.describe('Live status page — v1.5.2 additions', () => {
  test('the Happening now card shows the currently active claimed session', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Active Session Card Test' })
    const shootType = await createShootType(signupPage.id, { name: 'Cosplay Portrait' })
    // Brackets the real current moment, timezone-agnostic -- the
    // active-slot comparison in SignupLiveStatus.jsx is a raw epoch-ms
    // comparison against start_time/end_time, not display formatting.
    const now = Date.now()
    await createSlot(signupPage.id, shootType.id,
      new Date(now - 2 * 60_000).toISOString(), new Date(now + 13 * 60_000).toISOString(),
      { client_name: 'Currently Shooting', client_email: 'currently-shooting@example.com' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)
      await expect(page.getByText('Happening now')).toBeVisible()
      // The name legitimately appears twice -- once in the Happening now
      // card, once in the slot's normal listing below it -- so scope with
      // .first() rather than asserting a single match.
      await expect(page.getByText('Currently Shooting').first()).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('registering a walk-up claims the slot and creates a real client and session', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Walk-up Test Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Walk-up Shoot' })
    await createSlot(signupPage.id, shootType.id, '2026-09-01T19:00:00Z', '2026-09-01T19:15:00Z')
    const email = `walkup-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText('Tap to register a walk-up').click()
      await expect(page.getByRole('heading', { name: 'Register walk-up' })).toBeVisible()

      await page.getByPlaceholder('First name').fill('Walk')
      await page.getByPlaceholder('Last name').fill('Up')
      await page.getByPlaceholder('Email', { exact: true }).fill(email)
      await page.getByPlaceholder('Phone (optional)').fill('555-0142')
      await page.getByRole('button', { name: 'Register & confirm booking' }).click()

      await expect(page.getByRole('heading', { name: 'Register walk-up' })).not.toBeVisible({ timeout: 10000 })
      // .first() -- this is the only slot on the page, so once claimed
      // it's also whatever NowCard's Next-up line shows.
      await expect(page.getByText('Walk Up').first()).toBeVisible()
      await expect(page.getByText('Claimed', { exact: true })).toBeVisible()

      const { data: client } = await sb().from('clients').select('id').eq('email', email).single()
      expect(client).toBeTruthy()
      const { data: sessions } = await sb().from('sessions').select('id').eq('client_id', client.id)
      expect(sessions?.length).toBeGreaterThan(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('registering a walk-up for a slot claimed by someone else mid-flow shows a conflict error', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Walk-up Race Test Page' })
    const shootType = await createShootType(signupPage.id)
    const slot = await createSlot(signupPage.id, shootType.id, '2026-09-02T19:00:00Z', '2026-09-02T19:15:00Z')
    const winnerEmail = `walkup-race-winner-${crypto.randomUUID().slice(0, 8)}@example.com`
    const loserEmail = `walkup-race-loser-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText('Tap to register a walk-up').click()
      await page.getByPlaceholder('First name').fill('Race')
      await page.getByPlaceholder('Last name').fill('Loser')
      await page.getByPlaceholder('Email', { exact: true }).fill(loserEmail)

      // Someone else (the public booking page, another walk-up, etc.)
      // claims the exact same slot in the gap before this form submits.
      const { data: raceResult, error: raceError } = await sb().rpc('claim_signup_slot', {
        p_slot_id: slot.id, p_first_name: 'Race', p_last_name: 'Winner', p_email: winnerEmail,
      })
      expect(raceError, raceError?.message).toBeNull()
      expect(raceResult.success).toBe(true)

      await page.getByRole('button', { name: 'Register & confirm booking' }).click()
      await expect(page.getByText('This slot was just claimed by someone else.')).toBeVisible({ timeout: 10000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([winnerEmail, loserEmail])
    }
  })

  test('marking a claimed slot as no-show frees it back to open, keeping the client and session', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'No-show Test Page' })
    const shootType = await createShootType(signupPage.id)
    const email = `no-show-${crypto.randomUUID().slice(0, 8)}@example.com`
    const slot = await createSlot(signupPage.id, shootType.id, '2026-09-03T19:00:00Z', '2026-09-03T19:15:00Z')
    try {
      // A directly-inserted fixture slot has no real clients-table row --
      // client_name/email set that way are just denormalized display
      // fields on the slot itself. Claim it through the real RPC instead,
      // so there's a genuine client and session to check before/after,
      // same as a real no-show would actually arise from.
      const { data: claimResult, error: claimError } = await sb().rpc('claim_signup_slot', {
        p_slot_id: slot.id, p_first_name: 'No', p_last_name: 'Show', p_email: email,
      })
      expect(claimError, claimError?.message).toBeNull()
      expect(claimResult.success).toBe(true)

      const { data: clientBefore } = await sb().from('clients').select('id').eq('email', email).single()
      expect(clientBefore).toBeTruthy()

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByTitle('More options').click()
      await page.getByRole('button', { name: 'Mark as no-show' }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()

      await expect(page.getByText('No Show').first()).not.toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Open', { exact: true })).toBeVisible()

      // The client record and its session are untouched -- only the slot
      // itself was reset, per unclaimSlot's own contract in signupApi.js.
      const { data: clientAfter } = await sb().from('clients').select('id').eq('email', email).single()
      expect(clientAfter?.id).toBe(clientBefore.id)
      const { data: sessions } = await sb().from('sessions').select('id').eq('client_id', clientBefore.id)
      expect(sessions?.length).toBeGreaterThan(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('a private note can be added to a claimed slot and persists after reload', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Private Note Test Page' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-09-04T19:00:00Z', '2026-09-04T19:15:00Z',
      { client_name: 'Note Client', client_email: 'note-client@example.com' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByTitle('More options').click()
      await page.getByPlaceholder('e.g. Brought a friend').fill('Brought a friend, wants extra prints')

      // Wait for the actual PATCH response, not just the "Save note"
      // button disappearing -- that button's promise resolves as soon
      // as the app's own await settles, but the underlying browser
      // network request can still be in flight at that instant.
      // Reloading immediately after can abort it mid-flight
      // (net::ERR_ABORTED / NS_BINDING_ABORTED) before the write lands,
      // which is exactly what was causing this test to flake.
      await Promise.all([
        page.waitForResponse(res => res.url().includes('/signup_slots') && res.request().method() === 'PATCH'),
        page.getByRole('button', { name: 'Save note' }).click(),
      ])
      await expect(page.getByRole('button', { name: 'Save note' })).not.toBeVisible({ timeout: 10000 })

      await page.reload()
      await waitForReady(page)
      await expect(page.getByText('Brought a friend, wants extra prints')).toBeVisible({ timeout: 10000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('search filters the slot list by client name', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Search Test Page' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-09-05T19:00:00Z', '2026-09-05T19:15:00Z',
      { client_name: 'Findable Person', client_email: 'findable@example.com' })
    await createSlot(signupPage.id, shootType.id, '2026-09-05T19:15:00Z', '2026-09-05T19:30:00Z',
      { client_name: 'Someone Else', client_email: 'someone-else@example.com' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      // .first() for "Findable Person" specifically -- it's the earlier
      // of the two slots, so it's also whatever NowCard's "Next up" line
      // shows (that line isn't affected by the search filter below, only
      // the list is, so this collision exists both before and after
      // filtering). "Someone Else" is never the "next" slot here, so it
      // isn't duplicated the same way.
      await expect(page.getByText('Findable Person').first()).toBeVisible()
      await expect(page.getByText('Someone Else')).toBeVisible()

      await page.getByPlaceholder('Search by name or email...').fill('Findable')
      await expect(page.getByText('Findable Person').first()).toBeVisible()
      await expect(page.getByText('Someone Else')).not.toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('the Booked only filter hides open slots', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Booked Only Filter Test' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-09-06T19:00:00Z', '2026-09-06T19:15:00Z')
    await createSlot(signupPage.id, shootType.id, '2026-09-06T19:15:00Z', '2026-09-06T19:30:00Z',
      { client_name: 'Booked Client', client_email: 'booked-client@example.com' })
    try {
      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await expect(page.getByText('Open', { exact: true })).toBeVisible()
      await expect(page.getByText('Booked Client')).toBeVisible()

      await page.getByRole('button', { name: 'Filters & sort' }).click()
      await page.getByLabel('Status').selectOption('booked')

      await expect(page.getByText('Open', { exact: true })).not.toBeVisible()
      await expect(page.getByText('Booked Client')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})
