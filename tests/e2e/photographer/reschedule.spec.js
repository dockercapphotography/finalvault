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
  const { title, ...rest } = overrides
  const { data, error } = await sb().from('signup_pages').insert({
    photographer_id: photographerId,
    title: `${title || 'Reschedule Test Page'} ${crypto.randomUUID().slice(0, 6)}`,
    token: `reschedule-test-${crypto.randomUUID().slice(0, 8)}`,
    venue_address: '123 Test St, Columbus, OH',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...rest,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'Test Shoot', duration_minutes: 30, session_type: 'Portrait', sort_order: 0, ...overrides,
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

// Claims a slot via the real claim_signup_slot RPC (same one the public
// booking page and Live Status walk-up flow use), so the resulting
// booking has a real session behind it -- exactly what a reschedule test
// needs, since the whole point of these tests is confirming the session
// stays in sync with the slot.
async function claimSlot(slotId, { firstName, lastName, email }) {
  const { data, error } = await sb().rpc('claim_signup_slot', {
    p_slot_id: slotId, p_first_name: firstName, p_last_name: lastName, p_email: email,
  })
  if (error) throw new Error(error.message)
  if (!data.success) throw new Error(`claim failed: ${data.error}`)
  return data
}

async function cleanupSignupPage(pageId) {
  await sb().from('signup_pages').delete().eq('id', pageId)
}

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
  await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 15000 })
}

// All slots below use America/New_York (EDT, UTC-4 in September) as the
// signup page's timezone. Target/clicked-by-time slots deliberately use
// non-round minutes (e.g. :15/:45) rather than :00 -- the compact time
// formatter strips a bare ":00", which would make an on-the-hour time
// like "2:00 PM" render as just "2 PM", too ambiguous a substring to
// select on reliably. UTC->local conversions below were verified
// directly (18:00Z = 2:00 PM EDT, 19:15Z = 3:15 PM EDT, etc.) rather
// than assumed.

test.describe('Reschedule and move bookings', () => {
  test('moving a booking to an open slot of the same shoot type transfers it and keeps the session in sync', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Move Same Type Test' })
    const shootType = await createShootType(signupPage.id)
    const sourceSlot = await createSlot(signupPage.id, shootType.id, '2026-09-10T15:00:00Z', '2026-09-10T15:30:00Z')
    const targetSlot = await createSlot(signupPage.id, shootType.id, '2026-09-10T19:15:00Z', '2026-09-10T19:45:00Z')
    const email = `move-same-type-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const claimResult = await claimSlot(sourceSlot.id, { firstName: 'Move', lastName: 'Same', email })

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(email).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await expect(page.getByText('Reschedule booking')).toBeVisible()

      await page.getByRole('button', { name: /3:15/ }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Reschedule booking')).not.toBeVisible({ timeout: 10000 })

      const { data: source } = await sb().from('signup_slots').select('claimed_at, session_id').eq('id', sourceSlot.id).single()
      expect(source.claimed_at).toBeNull()
      expect(source.session_id).toBeNull()

      const { data: target } = await sb().from('signup_slots').select('claimed_at, client_name, session_id').eq('id', targetSlot.id).single()
      expect(target.claimed_at).toBeTruthy()
      expect(target.client_name).toBe('Move Same')

      const { data: session } = await sb().from('sessions').select('session_date, start_time').eq('id', claimResult.session_id).single()
      expect(session.session_date).toBe('2026-09-10')
      expect(session.start_time).toBe('15:15:00')
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('moving a booking across shoot types updates the session name and type', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Move Cross Type Test' })
    const shootTypeA = await createShootType(signupPage.id, { name: 'Portrait Session', session_type: 'Portrait' })
    const shootTypeB = await createShootType(signupPage.id, { name: 'Group Session', session_type: 'Family' })
    const sourceSlot = await createSlot(signupPage.id, shootTypeA.id, '2026-09-11T15:00:00Z', '2026-09-11T15:30:00Z')
    const targetSlot = await createSlot(signupPage.id, shootTypeB.id, '2026-09-11T19:15:00Z', '2026-09-11T19:45:00Z')
    const email = `move-cross-type-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const claimResult = await claimSlot(sourceSlot.id, { firstName: 'Cross', lastName: 'Type', email })

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(email).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await page.getByText('Show all shoot types').click()

      await page.getByRole('button', { name: /3:15/ }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Reschedule booking')).not.toBeVisible({ timeout: 10000 })

      const { data: session } = await sb().from('sessions').select('name, type').eq('id', claimResult.session_id).single()
      expect(session.name).toContain('Group Session')
      expect(session.type).toBe('Family')
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('an open slot that overlaps a different claimed booking does not appear in the move list', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Move Overlap Filter Test' })
    const shootTypeA = await createShootType(signupPage.id, { name: 'Type A' })
    const shootTypeB = await createShootType(signupPage.id, { name: 'Type B' })
    const bookingToMove = await createSlot(signupPage.id, shootTypeA.id, '2026-09-12T15:00:00Z', '2026-09-12T15:30:00Z')
    // Claimed on a different shoot type, 4:00-4:30pm local.
    const otherBooking = await createSlot(signupPage.id, shootTypeB.id, '2026-09-12T20:00:00Z', '2026-09-12T20:30:00Z')
    // Open, same shoot type as bookingToMove, but its time overlaps
    // otherBooking's claimed time (20:15-20:45 vs 20:00-20:30 UTC,
    // timezone-independent overlap check) -- should never be offered.
    const conflictingOpenSlot = await createSlot(signupPage.id, shootTypeA.id, '2026-09-12T20:15:00Z', '2026-09-12T20:45:00Z')
    const movedEmail = `overlap-filter-${crypto.randomUUID().slice(0, 8)}@example.com`
    const otherEmail = `overlap-other-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(bookingToMove.id, { firstName: 'Overlap', lastName: 'Mover', email: movedEmail })
      await claimSlot(otherBooking.id, { firstName: 'Overlap', lastName: 'Blocker', email: otherEmail })

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(movedEmail).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()

      // sameTypeOnly defaults on; conflictingOpenSlot is the only open
      // slot of bookingToMove's type, and it's filtered out for
      // overlapping otherBooking -- so the list should be empty.
      await expect(page.getByText('No open slots')).toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([movedEmail, otherEmail])
    }
  })

  test('changing a booking to a custom time that conflicts with another booking disables Confirm with an inline warning', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Custom Time Conflict Test' })
    const shootType = await createShootType(signupPage.id)
    const bookingToEdit = await createSlot(signupPage.id, shootType.id, '2026-09-13T15:00:00Z', '2026-09-13T15:30:00Z')
    // 4:00-4:30pm local.
    const otherBooking = await createSlot(signupPage.id, shootType.id, '2026-09-13T20:00:00Z', '2026-09-13T20:30:00Z')
    const editEmail = `custom-conflict-edit-${crypto.randomUUID().slice(0, 8)}@example.com`
    const otherEmail = `custom-conflict-other-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(bookingToEdit.id, { firstName: 'Custom', lastName: 'Edit', email: editEmail })
      await claimSlot(otherBooking.id, { firstName: 'Custom', lastName: 'Other', email: otherEmail })

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(editEmail).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await page.getByRole('button', { name: 'Custom time' }).click()

      // otherBooking runs 4:00-4:30pm local -- pick an overlapping range.
      const timeInputs = page.locator('input[type="time"]')
      await timeInputs.nth(0).fill('16:15')
      await timeInputs.nth(1).fill('16:45')

      await expect(page.getByText('That time conflicts with another booking.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([editEmail, otherEmail])
    }
  })

  test('changing a booking to a genuinely open custom time succeeds and updates the session', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Custom Time Success Test' })
    const shootType = await createShootType(signupPage.id)
    const bookingToEdit = await createSlot(signupPage.id, shootType.id, '2026-09-14T15:00:00Z', '2026-09-14T15:30:00Z')
    const email = `custom-success-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      const claimResult = await claimSlot(bookingToEdit.id, { firstName: 'Custom', lastName: 'Success', email })

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(email).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await page.getByRole('button', { name: 'Custom time' }).click()

      const timeInputs = page.locator('input[type="time"]')
      await timeInputs.nth(0).fill('16:00')
      await timeInputs.nth(1).fill('16:30')

      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Reschedule booking')).not.toBeVisible({ timeout: 10000 })

      const { data: slot } = await sb().from('signup_slots').select('start_time, end_time').eq('id', bookingToEdit.id).single()
      expect(new Date(slot.start_time).toISOString()).toBe('2026-09-14T20:00:00.000Z')

      const { data: session } = await sb().from('sessions').select('start_time').eq('id', claimResult.session_id).single()
      expect(session.start_time).toBe('16:00:00')
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('rescheduling a booking does not create a new claim-style notification', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'No Spurious Notification Test' })
    const shootType = await createShootType(signupPage.id)
    const sourceSlot = await createSlot(signupPage.id, shootType.id, '2026-09-15T15:00:00Z', '2026-09-15T15:30:00Z')
    const targetSlot = await createSlot(signupPage.id, shootType.id, '2026-09-15T19:15:00Z', '2026-09-15T19:45:00Z')
    const email = `no-spurious-notif-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(sourceSlot.id, { firstName: 'Notif', lastName: 'Test', email })

      const { count: countBefore } = await sb().from('notifications').select('*', { count: 'exact', head: true }).eq('type', 'slot_claimed')

      await page.goto(`/sessions/signups/${signupPage.id}/status`)
      await waitForReady(page)

      await page.getByText(email).first().click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await page.getByRole('button', { name: /3:15/ }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Reschedule booking')).not.toBeVisible({ timeout: 10000 })

      const { count: countAfter } = await sb().from('notifications').select('*', { count: 'exact', head: true }).eq('type', 'slot_claimed')
      expect(countAfter).toBe(countBefore)
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('the Reschedule button is also available from Sessions -> Signups', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Signups Surface Reschedule Test' })
    const shootType = await createShootType(signupPage.id)
    const sourceSlot = await createSlot(signupPage.id, shootType.id, '2026-09-16T15:00:00Z', '2026-09-16T15:30:00Z')
    const targetSlot = await createSlot(signupPage.id, shootType.id, '2026-09-16T19:15:00Z', '2026-09-16T19:45:00Z')
    const email = `signups-surface-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(sourceSlot.id, { firstName: 'Signups', lastName: 'Surface', email })

      await page.goto('/sessions')
      await page.getByRole('button', { name: 'Sign-ups' }).click()
      await waitForReady(page)
      await page.getByText(signupPage.title).click()
      await expect(page.getByText('Slots by day')).toBeVisible()

      // Expand the day, use the claimed row's Reschedule button directly
      // -- SlotDayRow's rows aren't click-to-expand, only the button is
      // interactive on a claimed row.
      await page.getByText(/Sep 16/).click()
      await page.getByRole('button', { name: 'Reschedule', exact: true }).click()
      await expect(page.getByText('Reschedule booking')).toBeVisible()

      await page.getByRole('button', { name: /3:15/ }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Reschedule booking')).not.toBeVisible({ timeout: 10000 })

      const { data: target } = await sb().from('signup_slots').select('claimed_at, client_name').eq('id', targetSlot.id).single()
      expect(target.client_name).toBe('Signups Surface')
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })
})
