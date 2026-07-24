import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Push Notifications (Account → Notifications tab)
 *
 * Chromium-only: PushManager/Notification behavior differs meaningfully
 * across browser engines (WebKit push requires a Home Screen install
 * that isn't achievable in an automated context; Firefox's push
 * internals differ enough to not be worth mirroring here). Also
 * excluded on mobile-chrome via the project's existing
 * testIgnore: /photographer\// pattern.
 *
 * NOT covered here: cross-tenant RLS isolation. The suite runs against
 * live production Supabase (no separate test environment) -- properly
 * verifying that one photographer can't see another's push_subscriptions
 * rows would mean writing test data against a real second photographer's
 * account, or standing up a throwaway second auth user, either of which
 * is more invasive than this feature warrants. The RLS policies
 * themselves (auth.uid() = photographer_id on select/insert/delete) were
 * confirmed directly via the SQL Editor when the migration was written.
 */

function adminClient() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Push notifications', () => {
  let sb
  let photographerId

  test.beforeAll(async () => {
    sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
    photographerId = user.id
  })

  test.beforeEach(async ({ browserName }) => {
    if (browserName !== 'chromium') test.skip()
    // Clean slate -- any leftover subscription from a prior failed run
    // would make these tests flaky rather than reliably red/green.
    await sb.from('push_subscriptions').delete().eq('photographer_id', photographerId)
  })

  test.afterEach(async () => {
    await sb.from('push_subscriptions').delete().eq('photographer_id', photographerId)
  })

  // Scopes to the specific SettingsSection whose heading is "Push
  // Notifications" -- the Notifications tab also has an Activity Digest
  // section with its own checkboxes above this one, so a bare
  // getByRole('checkbox') would be ambiguous.
  // Toggle.jsx renders the real <input type="checkbox"> as sr-only
  // (visually hidden) with a styled div layered on top as the visible
  // switch -- standard pattern for custom-styled toggles. Playwright's
  // default actionability check correctly refuses to click something a
  // real mouse can't visually reach, so force: true is needed here; the
  // checkbox is still the right, functional element (confirmed via the
  // locator resolving to it), just intentionally hidden by design.
  function pushSection(page) {
    return page.locator('div.rounded-xl.overflow-hidden', {
      has: page.getByRole('heading', { name: 'Push Notifications', level: 3 }),
    })
  }

  // context.grantPermissions(['notifications']) does not reliably
  // override headless Chromium's default-denied Notification.permission
  // (confirmed empirically -- CDP's permission grant for 'notifications'
  // has known flakiness in headless mode independent of anything in this
  // app). Real OS/browser permission integration was already verified
  // manually against a real Chrome window earlier this session; what
  // these tests need to verify deterministically is our app's own logic
  // once permission is granted, so we mock the Notification API directly
  // at the JS level, before any app code runs.
  //
  // Also mocks PushManager.subscribe/getSubscription and the returned
  // subscription's unsubscribe() -- reg.pushManager.subscribe() makes a
  // real network round-trip to the browser's push service (Google's FCM
  // for Chrome) even in an automated context, and that round-trip proved
  // unreliable enough in this environment to make the tests flaky
  // (confirmed: DB poll timing out with zero rows created, independent of
  // how generous the timeout was). The real end-to-end push path --
  // real subscribe, real VAPID signing, real delivery -- was already
  // verified manually on a real device earlier this session; these tests
  // exist to verify our own subscribe/unsubscribe/UI logic
  // deterministically, not to re-prove third-party push infrastructure
  // works.
  async function mockPushAPIs(page) {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true })
      Notification.requestPermission = () => Promise.resolve('granted')

      // addInitScript re-runs fresh on every navigation, including
      // page.reload() -- a plain JS variable here would reset on reload,
      // unlike a real subscription, which persists. sessionStorage
      // survives reloads within the same tab/context (and is cleared
      // when the context closes), matching the behavior we're mocking.
      const STORAGE_KEY = '__pw_fake_push_subscription__'

      function readFakeSub() {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return {
          endpoint: parsed.endpoint,
          toJSON: () => parsed,
          unsubscribe: () => { sessionStorage.removeItem(STORAGE_KEY); return Promise.resolve(true) },
        }
      }

      function createFakeSub() {
        const endpoint = 'https://fake-push-service.test/' + Math.random().toString(36).slice(2)
        const parsed = { endpoint, keys: { p256dh: 'fake-p256dh-key', auth: 'fake-auth-key' } }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        return { endpoint, toJSON: () => parsed, unsubscribe: () => { sessionStorage.removeItem(STORAGE_KEY); return Promise.resolve(true) } }
      }

      if (window.PushManager) {
        PushManager.prototype.subscribe = function () {
          return Promise.resolve(readFakeSub() || createFakeSub())
        }
        PushManager.prototype.getSubscription = function () {
          return Promise.resolve(readFakeSub())
        }
      }
    })
  }

  async function gotoNotificationsTab(page) {
    await mockPushAPIs(page)
    await page.goto('/account?tab=notifications')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(pushSection(page)).toBeVisible()
  }

  test('enabling creates a push_subscriptions row with the expected shape', async ({ page }) => {
    await gotoNotificationsTab(page)

    await pushSection(page).getByRole('checkbox').click({ force: true })

    await expect
      .poll(async () => {
        const { data } = await sb
          .from('push_subscriptions')
          .select('*')
          .eq('photographer_id', photographerId)
        return data?.length ?? 0
      }, { timeout: 20000 })
      .toBe(1)

    const { data } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('photographer_id', photographerId)
      .single()

    expect(data.endpoint).toBeTruthy()
    expect(data.p256dh).toBeTruthy()
    expect(data.auth).toBeTruthy()
    expect(data.user_agent).toBeTruthy()
  })

  test('"This device" appears in the subscribed devices list after enabling', async ({ page }) => {
    await gotoNotificationsTab(page)

    await pushSection(page).getByRole('checkbox').click({ force: true })
    await expect(pushSection(page).getByText('This device', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('disabling deletes the push_subscriptions row', async ({ page }) => {
    await gotoNotificationsTab(page)

    const checkbox = pushSection(page).getByRole('checkbox')
    await checkbox.click({ force: true })
    await expect(pushSection(page).getByText('This device', { exact: true })).toBeVisible({ timeout: 10000 })

    await checkbox.click({ force: true })

    await expect
      .poll(async () => {
        const { data } = await sb
          .from('push_subscriptions')
          .select('*')
          .eq('photographer_id', photographerId)
        return data?.length ?? 0
      }, { timeout: 20000 })
      .toBe(0)

    await expect(pushSection(page).getByText('This device', { exact: true })).not.toBeVisible({ timeout: 15000 })
  })

  test('subscription persists across a page reload', async ({ page }) => {
    await gotoNotificationsTab(page)

    await pushSection(page).getByRole('checkbox').click({ force: true })
    await expect(pushSection(page).getByText('This device', { exact: true })).toBeVisible({ timeout: 10000 })

    await page.reload()
    await expect(pushSection(page)).toBeVisible()
    await expect(pushSection(page).getByText('This device', { exact: true })).toBeVisible({ timeout: 10000 })

    const { data, error } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('photographer_id', photographerId)
    if (error || data?.length !== 1) {
      console.log('[debug] push_subscriptions query error:', error)
      console.log('[debug] push_subscriptions rows:', JSON.stringify(data, null, 2))
    }
    expect(data?.length).toBe(1)
  })
})
