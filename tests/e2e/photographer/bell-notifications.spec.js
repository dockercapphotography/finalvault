import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Bell Notifications (Account → Notifications tab)
 *
 * Same conventions as push-notifications.spec.js: a local admin client,
 * force:true clicks on Toggle.jsx's visually-hidden real checkbox, and
 * a clean-slate before/after each test so a leftover row from a failed
 * prior run can't make these flaky.
 *
 * NOT covered here: the visibility-cutoff behavior (turning a
 * long-off preference back on only shows events from that moment
 * forward, not the backlog that piled up while it was off). Exercising
 * that meaningfully needs real elapsed time between a preference being
 * off and a qualifying event occurring, which isn't practical to
 * simulate deterministically in this suite -- confirmed instead via
 * manual testing this session (turned favorites off, favorited,
 * re-enabled, favorited again, confirmed only the second favorite
 * showed in the bell).
 */

function adminClient() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Bell notifications', () => {
  let sb
  let photographerId

  test.beforeAll(async () => {
    sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
    photographerId = user.id
  })

  test.beforeEach(async () => {
    await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
  })

  test.afterEach(async () => {
    await sb.from('bell_notification_preferences').delete().eq('photographer_id', photographerId)
  })

  function bellSection(page) {
    return page.locator('div.rounded-xl.overflow-hidden', {
      has: page.getByRole('heading', { name: 'Bell Notifications', level: 3 }),
    })
  }

  function preferenceRow(page, label) {
    return page.getByText(label, { exact: true }).locator('xpath=../..')
  }

  async function gotoNotificationsTab(page) {
    await page.goto('/account?tab=notifications')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(bellSection(page)).toBeVisible()
  }

  test('all 8 event types are visible and default to on (no preferences row exists yet)', async ({ page }) => {
    await gotoNotificationsTab(page)

    for (const label of [
      'New booking', 'New inquiry', 'Contract signed', 'Questionnaire response',
      'Gallery views', 'Client favorites', 'Client comments', 'Client downloads',
    ]) {
      const row = preferenceRow(page, label)
      await expect(row).toBeVisible({ timeout: 10000 })
      await expect(row.getByRole('checkbox')).toBeChecked()
    }
  })

  test('turning the master toggle off collapses the 8 individual rows', async ({ page }) => {
    await gotoNotificationsTab(page)

    await expect(preferenceRow(page, 'New booking')).toBeVisible({ timeout: 10000 })

    await bellSection(page).getByRole('checkbox').first().click({ force: true })

    await expect(preferenceRow(page, 'New booking')).not.toBeVisible({ timeout: 10000 })
    await expect(preferenceRow(page, 'Client favorites')).not.toBeVisible()
  })

  test('turning the master toggle off persists enabled: false', async ({ page }) => {
    await gotoNotificationsTab(page)

    await bellSection(page).getByRole('checkbox').first().click({ force: true })

    await expect
      .poll(async () => {
        const { data } = await sb
          .from('bell_notification_preferences')
          .select('enabled')
          .eq('photographer_id', photographerId)
          .maybeSingle()
        return data?.enabled
      }, { timeout: 15000 })
      .toBe(false)
  })

  test('toggling one individual row off persists to bell_notification_preferences without affecting others', async ({ page }) => {
    await gotoNotificationsTab(page)

    const favoritesRow = preferenceRow(page, 'Client favorites')
    await expect(favoritesRow).toBeVisible({ timeout: 10000 })
    await favoritesRow.getByRole('checkbox').click({ force: true })

    await expect
      .poll(async () => {
        const { data } = await sb
          .from('bell_notification_preferences')
          .select('favorite')
          .eq('photographer_id', photographerId)
          .maybeSingle()
        return data?.favorite
      }, { timeout: 15000 })
      .toBe(false)

    await expect(preferenceRow(page, 'New booking').getByRole('checkbox')).toBeChecked()
    await expect(preferenceRow(page, 'Client comments').getByRole('checkbox')).toBeChecked()
  })
})
