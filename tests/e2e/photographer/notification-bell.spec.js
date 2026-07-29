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
    title: `${title || 'Bell Test Page'} ${crypto.randomUUID().slice(0, 6)}`,
    token: `bell-test-${crypto.randomUUID().slice(0, 8)}`,
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

// The bell button exists as two separate DOM instances at once (mobile
// header + desktop sidebar) regardless of actual viewport -- CSS handles
// which is shown, not conditional mounting. Both now share the same
// aria-label (added specifically to make this testable), so ":visible"
// is needed to land on the one actually shown at this test's viewport.
function bellButton(page) {
  return page.locator('button[aria-label="Notifications"]:visible')
}

test.describe('Notification bell', () => {
  test('claiming a slot creates a notification visible in the bell', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Bell Claim Test' })
    const shootType = await createShootType(signupPage.id)
    const slot = await createSlot(signupPage.id, shootType.id, '2026-09-20T19:00:00Z', '2026-09-20T19:30:00Z')
    const email = `bell-claim-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(slot.id, { firstName: 'Bell', lastName: 'Claimant', email })

      await page.goto('/sessions')
      await bellButton(page).click()

      await expect(page.getByText('Bell Claimant claimed a slot')).toBeVisible({ timeout: 10000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })

  test('clicking a claim notification navigates to that signup page\'s Live Status', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Bell Navigate Test' })
    const shootType = await createShootType(signupPage.id)
    const slot = await createSlot(signupPage.id, shootType.id, '2026-09-21T19:00:00Z', '2026-09-21T19:30:00Z')
    const email = `bell-navigate-${crypto.randomUUID().slice(0, 8)}@example.com`
    try {
      await claimSlot(slot.id, { firstName: 'Bell', lastName: 'Navigator', email })

      await page.goto('/sessions')
      await bellButton(page).click()
      await page.getByText('Bell Navigator claimed a slot').click()

      await expect(page).toHaveURL(new RegExp(`/sessions/signups/${signupPage.id}/status`), { timeout: 10000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupClientsByEmail([email])
    }
  })
})
