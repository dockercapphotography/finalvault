import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Same fixture conventions as signup-booking.spec.js (service-role Supabase
// client, direct table writes instead of going through the UI, cleanup by
// id/email in a finally block) -- this suite exercises the *aggregate*
// public booking page (/book/all/:token) rather than a single page's.

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getPhotographer() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  const { data, error } = await sb().from('photographers').select('id, all_sessions_token').eq('id', user.id).single()
  if (error) throw new Error(error.message)
  if (!data.all_sessions_token) throw new Error('Test photographer has no all_sessions_token -- has migration 055 been run?')
  return data
}

async function createSignupPage(photographerId, overrides = {}) {
  const { data, error } = await sb().from('signup_pages').insert({
    photographer_id: photographerId,
    title: 'All-Sessions Test Page',
    token: `all-sessions-test-${crypto.randomUUID().slice(0, 8)}`,
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

async function cleanupSignupPage(pageId) {
  await sb().from('signup_pages').delete().eq('id', pageId)
}

// The /book/all/:token page aggregates EVERY active signup page on the
// account, not just ones this file creates -- so any test asserting an
// exact page count (the single-page passthrough, the chooser's contents)
// has to own the account's active/inactive state for its duration, not
// just its own fixtures. These two helpers park every other currently-
// active page as inactive for the test and put them back in `finally`,
// the same way the rest of this suite restores what it touched.
async function deactivateOtherActivePages(photographerId, keepIds = []) {
  const { data } = await sb().from('signup_pages')
    .select('id').eq('photographer_id', photographerId).eq('is_active', true)
  const ids = (data ?? []).map(p => p.id).filter(id => !keepIds.includes(id))
  if (ids.length > 0) await sb().from('signup_pages').update({ is_active: false }).in('id', ids)
  return ids
}

async function reactivatePages(ids) {
  if (ids.length > 0) await sb().from('signup_pages').update({ is_active: true }).in('id', ids)
}

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// Mirrors AllSessionsBooking.jsx's own formatSessionDates() so expected
// strings are computed the same way the component computes them, not
// hardcoded -- keeps this test correct regardless of when it runs.
function formatDate(date, timezone) {
  return date.toLocaleDateString('en-US', { timeZone: timezone, month: 'short', day: 'numeric' })
}

function futureSlot(daysFromNow) {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + daysFromNow)
  start.setUTCHours(19, 0, 0, 0) // arbitrary future time, not asserted on directly
  const end = new Date(start.getTime() + 15 * 60000)
  return { start, end }
}

test.describe('Public all-sessions booking page', () => {
  test('unknown token shows the link-not-valid message', async ({ page }) => {
    await page.goto('/book/all/not-a-real-token')
    await waitForReady(page)
    await expect(page.getByText("This link isn't valid")).toBeVisible()
  })

  test('zero active sessions shows an empty state', async ({ page }) => {
    const photographer = await getPhotographer()
    const parked = await deactivateOtherActivePages(photographer.id)
    try {
      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      await expect(page.getByText('Nothing is open for booking right now.', { exact: false })).toBeVisible()
    } finally {
      await reactivatePages(parked)
    }
  })

  test('exactly one active session redirects straight to its own booking page', async ({ page }) => {
    const photographer = await getPhotographer()
    const signupPage = await createSignupPage(photographer.id, { title: 'Only Active Page' })
    const shootType = await createShootType(signupPage.id)
    const { start, end } = futureSlot(5)
    await createSlot(signupPage.id, shootType.id, start.toISOString(), end.toISOString())
    const parked = await deactivateOtherActivePages(photographer.id, [signupPage.id])
    try {
      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      // Lands on the single page's own booking flow, not the chooser.
      await expect(page).toHaveURL(new RegExp(`/book/${signupPage.token}$`))
      await expect(page.getByText('Only Active Page')).toBeVisible()
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('multiple active sessions show a chooser listing each with its dates', async ({ page }) => {
    const photographer = await getPhotographer()
    const pageA = await createSignupPage(photographer.id, { title: 'GenCon Portraits', venue_address: 'Indiana Convention Center' })
    const shootTypeA = await createShootType(pageA.id)
    const slotA = futureSlot(5)
    await createSlot(pageA.id, shootTypeA.id, slotA.start.toISOString(), slotA.end.toISOString())

    const pageB = await createSignupPage(photographer.id, { title: 'Boudoir Weekend' })
    const shootTypeB = await createShootType(pageB.id)
    const slotB = futureSlot(9)
    await createSlot(pageB.id, shootTypeB.id, slotB.start.toISOString(), slotB.end.toISOString())

    const parked = await deactivateOtherActivePages(photographer.id, [pageA.id, pageB.id])
    try {
      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      await expect(page.getByText('Choose a session to book')).toBeVisible()

      await expect(page.getByText('GenCon Portraits')).toBeVisible()
      await expect(page.getByText('Indiana Convention Center')).toBeVisible()
      await expect(page.getByText(formatDate(slotA.start, pageA.timezone))).toBeVisible()

      await expect(page.getByText('Boudoir Weekend')).toBeVisible()
      await expect(page.getByText(formatDate(slotB.start, pageB.timezone))).toBeVisible()

      // Picking one navigates to that page's own booking flow.
      await page.getByText('GenCon Portraits').click()
      await expect(page).toHaveURL(new RegExp(`/book/${pageA.token}$`))
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(pageA.id)
      await cleanupSignupPage(pageB.id)
    }
  })

  test('an active session with no open slots shows a fallback instead of dates', async ({ page }) => {
    const photographer = await getPhotographer()
    const emptyPage = await createSignupPage(photographer.id, { title: 'Fully Booked Weekend' })
    await createShootType(emptyPage.id) // no slots created -- nothing open

    const otherPage = await createSignupPage(photographer.id, { title: 'Open Weekend' })
    const otherShootType = await createShootType(otherPage.id)
    const otherSlot = futureSlot(6)
    await createSlot(otherPage.id, otherShootType.id, otherSlot.start.toISOString(), otherSlot.end.toISOString())

    const parked = await deactivateOtherActivePages(photographer.id, [emptyPage.id, otherPage.id])
    try {
      await page.goto(`/book/all/${photographer.all_sessions_token}`)
      await waitForReady(page)
      await expect(page.getByText('Fully Booked Weekend')).toBeVisible()
      await expect(page.getByText('No upcoming times open')).toBeVisible()
      await expect(page.getByText(formatDate(otherSlot.start, otherPage.timezone))).toBeVisible()
    } finally {
      await reactivatePages(parked)
      await cleanupSignupPage(emptyPage.id)
      await cleanupSignupPage(otherPage.id)
    }
  })
})
