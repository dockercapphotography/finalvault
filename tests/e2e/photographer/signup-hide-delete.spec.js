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
    title: 'Hide Delete Test Page',
    token: `hide-delete-test-${crypto.randomUUID().slice(0, 8)}`,
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

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

async function goToSignups(page) {
  await page.goto('/sessions')
  await waitForReady(page)
  await page.getByRole('button', { name: 'Sign-ups' }).click()
}

// Scopes to a specific signup page card, since the test account has many
// pre-existing pages -- an unscoped "Signup page actions" query would be
// ambiguous. The trigger button lives inside the card; the opened menu's
// items render via PortalMenu's createPortal straight into document.body,
// so those are located page-wide, not through this scoped card.
function signupCard(page, title) {
  return page.locator('div.rounded-2xl').filter({ hasText: title }).first()
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Signup page hide/unhide', () => {
  test('hiding a page removes it from the default list and shows a Show hidden toggle', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Hide Me Page' })
    try {
      await goToSignups(page)
      await expect(page.getByText('Hide Me Page')).toBeVisible()

      await signupCard(page, 'Hide Me Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Hide', exact: true }).click()

      await expect(page.getByText('Hide Me Page')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: /Show hidden \(1\)/ })).toBeVisible()

      const { data } = await sb().from('signup_pages').select('archived_at').eq('id', signupPage.id).single()
      expect(data.archived_at).not.toBeNull()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('Show hidden reveals a hidden page, and Unhide restores it to the default list', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Unhide Me Page', archived_at: new Date().toISOString() })
    try {
      await goToSignups(page)
      await expect(page.getByText('Unhide Me Page')).not.toBeVisible()

      await page.getByRole('button', { name: /Show hidden/ }).click()
      await expect(page.getByText('Unhide Me Page')).toBeVisible()
      await expect(page.getByText('Hidden', { exact: true })).toBeVisible()

      await signupCard(page, 'Unhide Me Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Unhide', exact: true }).click()

      await expect(page.getByText('Hidden', { exact: true })).not.toBeVisible({ timeout: 5000 })
      const { data } = await sb().from('signup_pages').select('archived_at').eq('id', signupPage.id).single()
      expect(data.archived_at).toBeNull()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })
})

test.describe('Signup page delete confirmation', () => {
  test('a slots page with no bookings shows generic confirm text', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Delete No Bookings Page' })
    try {
      await goToSignups(page)
      await signupCard(page, 'Delete No Bookings Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText("This can't be undone.")).toBeVisible({ timeout: 5000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('a slots page with real bookings shows the real claimed count', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Delete With Bookings Page' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-10-10T19:00:00Z', '2026-10-10T19:15:00Z',
      { client_name: 'Booked Client', client_email: 'booked@example.com' })
    try {
      await goToSignups(page)
      await signupCard(page, 'Delete With Bookings Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText(/1 booked appointment will be lost/)).toBeVisible({ timeout: 5000 })
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('confirming delete actually removes the page', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Really Delete Me Page' })
    try {
      await goToSignups(page)
      await signupCard(page, 'Really Delete Me Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText("This can't be undone.")).toBeVisible({ timeout: 5000 })
      // Only the confirm button is on the page at this point (menu item
      // replaced by the confirm view within the same dropdown).
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      await expect(page.getByText('Really Delete Me Page')).not.toBeVisible({ timeout: 5000 })
      const { data } = await sb().from('signup_pages').select('id').eq('id', signupPage.id).maybeSingle()
      expect(data).toBeNull()
    } finally {
      await cleanupSignupPage(signupPage.id) // no-op if already deleted
    }
  })

  test('an inquiry page with linked sessions shows linked-session wording, not slot wording', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Inquiry Delete Test Page', mode: 'inquiry' })
    const shootType = await createShootType(signupPage.id, { duration_minutes: 60 })
    const photographerId = await getPhotographerId()
    const clientEmail = `linked-${crypto.randomUUID().slice(0, 8)}@example.com`
    const { data: client } = await sb().from('clients').insert({
      photographer_id: photographerId, first_name: 'Linked', last_name: 'Client', email: clientEmail,
    }).select().single()
    await sb().from('sessions').insert({
      photographer_id: photographerId, client_id: client.id, name: 'Linked inquiry session',
      type: shootType.session_type, mode: 'private', status: 'inquiry',
      session_date: '2026-11-01', start_time: '10:00:00', end_time: '11:00:00',
      signup_page_id: signupPage.id, submit_token: crypto.randomUUID().replace(/-/g, ''),
    })
    try {
      await goToSignups(page)
      await signupCard(page, 'Inquiry Delete Test Page').getByRole('button', { name: 'Signup page actions' }).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText(/1 linked session will lose their connection to this page/)).toBeVisible({ timeout: 5000 })
    } finally {
      await sb().from('sessions').delete().eq('signup_page_id', signupPage.id)
      await sb().from('clients').delete().eq('id', client.id)
      await cleanupSignupPage(signupPage.id)
    }
  })
})
