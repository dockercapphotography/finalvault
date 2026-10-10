import { test, expect } from '../../fixtures/fixtures.js'
import {
  adminClient, getTestPhotographerId, createReviewSession, createRequest, submitViaRpc,
  getReviewEmail, setReviewEmail, cleanupLeftovers,
} from '../../fixtures/reviews.js'

/**
 * Review notifications (v1.5.17): the New review rows in Account ->
 * Notifications, the bell updating live when a client submits, and the
 * bell preference hiding it.
 *
 * These use the real submit_testimonial so the bell row is created the
 * way production creates it. The photographer's "New review" email is
 * switched off for the whole file (and restored after) so no Resend
 * quota is used.
 */

let sb
let photographerId
let originalReviewEmail
let originalBellPrefs

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
  await cleanupLeftovers(sb, photographerId)
  originalReviewEmail = await getReviewEmail(sb, photographerId)
  await setReviewEmail(sb, photographerId, false)
  const { data } = await sb.from('bell_notification_preferences').select('*').eq('photographer_id', photographerId).maybeSingle()
  originalBellPrefs = data
})

test.afterAll(async () => {
  await setReviewEmail(sb, photographerId, originalReviewEmail)
  await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
  if (originalBellPrefs) await sb.from('bell_notification_preferences').insert(originalBellPrefs)
})

function bellButton(page) {
  return page.locator('button[aria-label="Notifications"]:visible')
}

function section(page, title) {
  return page.locator('div.rounded-xl.overflow-hidden', {
    has: page.getByRole('heading', { name: title, level: 3 }),
  })
}

test.describe('Notification settings', () => {
  test('Bell and Email sections both have a New review row; the email toggle persists', async ({ page }) => {
    await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
    await setReviewEmail(sb, photographerId, null) // no row = on
    try {
      await page.goto('/account?tab=notifications')
      await expect(section(page, 'Bell Notifications').getByText('New review', { exact: true })).toBeVisible({ timeout: 10000 })

      const email = section(page, 'Email Notifications')
      await expect(email.getByText('New review', { exact: true })).toBeVisible()
      const toggle = email.getByRole('checkbox')
      await expect(toggle).toBeChecked()
      await toggle.click({ force: true })
      await expect(toggle).not.toBeChecked()
      await expect.poll(() => getReviewEmail(sb, photographerId)).toBe(false)
    } finally {
      await setReviewEmail(sb, photographerId, false)
    }
  })
})

test.describe('Bell — new reviews', () => {
  test('a submitted review appears in an open bell without reloading, and links to its session', async ({ page, withPremiumAccess }) => {
    await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    try {
      const request = await createRequest(sb, photographerId, { session, client })
      await page.goto('/sessions')
      await bellButton(page).click()
      // Let the realtime channels subscribe before the event happens.
      await page.waitForTimeout(2000)

      await submitViaRpc(sb, request.token, { quote: 'Live bell test' })

      const item = page.getByText(`Revi ${client.last_name} left a review`)
      await expect(item).toBeVisible({ timeout: 15000 })
      await item.click()
      await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}#review$`), { timeout: 10000 })
    } finally {
      await cleanup()
    }
  })

  test('with the bell New review setting off, it does not appear', async ({ page, withPremiumAccess }) => {
    await sb.from('bell_notification_preferences').upsert(
      { photographer_id: photographerId, enabled: true, testimonial: false, updated_at: new Date().toISOString() },
      { onConflict: 'photographer_id' }
    )
    const { session, client, cleanup } = await createReviewSession(sb, photographerId)
    try {
      const request = await createRequest(sb, photographerId, { session, client })
      await page.goto('/sessions')
      await bellButton(page).click()
      await page.waitForTimeout(2000)

      await submitViaRpc(sb, request.token, { quote: 'Hidden bell test' })

      // Give realtime and the debounced reload time to have shown it.
      await page.waitForTimeout(5000)
      await expect(page.getByText(`Revi ${client.last_name} left a review`)).toHaveCount(0)
    } finally {
      await cleanup()
      await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
    }
  })
})
