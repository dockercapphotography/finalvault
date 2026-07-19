import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ── Supabase admin client ─────────────────────────────────────────────────────

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

async function createTestClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Gate',
    last_name: 'Test',
    email: `gate-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    portal_token: crypto.randomUUID().replace(/-/g, ''),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupClient(clientId) {
  await sb().from('clients').delete().eq('id', clientId)
}

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// These tests need two different identities in the same test: the
// photographer (to set a real portal password through the actual RPC, not
// a raw DB insert -- these gate tests specifically need a genuinely
// crypt-verifiable hash, unlike the ClientDetail UI-only tests which only
// care that *a* hash is present) and an anonymous client (to hit the gate
// itself). The default page fixture below is the photographer; each test
// spins up its own anonymous browser context for the client side, mirroring
// the pattern already used in activity-feed.spec.js.
test.use({ storageState: 'tests/.auth/photographer.json' })

async function setRealPortalPassword(page, clientId, password) {
  await page.goto(`/clients/${clientId}`)
  await expect(page.getByRole('button', { name: 'Add password' })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Add password' }).click()
  await page.getByPlaceholder('Enter password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Portal password added')).toBeVisible()
}

test.describe('Client portal password gate', () => {
  test('client without a password set is unaffected', async ({ browser }) => {
    const client = await createTestClient()
    try {
      const clientCtx = await browser.newContext()
      const clientPage = await clientCtx.newPage()
      await clientPage.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(clientPage)
      await expect(clientPage.getByText('Password required')).not.toBeVisible()
      await clientCtx.close()
    } finally {
      await cleanupClient(client.id)
    }
  })

  test('wrong password shows an error and no portal data', async ({ page, browser }) => {
    const client = await createTestClient()
    try {
      await setRealPortalPassword(page, client.id, 'correcthorse1')
      const clientCtx = await browser.newContext()
      const clientPage = await clientCtx.newPage()
      await clientPage.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(clientPage)
      await expect(clientPage.getByText('Password required')).toBeVisible()
      await clientPage.getByPlaceholder('Password').fill('wrongpassword')
      await clientPage.getByRole('button', { name: 'Continue' }).click()
      await expect(clientPage.getByText('Incorrect password. Please try again.')).toBeVisible()
      await clientCtx.close()
    } finally {
      await cleanupClient(client.id)
    }
  })

  test('correct password unlocks and persists across portal sections', async ({ page, browser }) => {
    const client = await createTestClient()
    try {
      await setRealPortalPassword(page, client.id, 'correcthorse2')
      const clientCtx = await browser.newContext()
      const clientPage = await clientCtx.newPage()
      await clientPage.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(clientPage)
      await clientPage.getByPlaceholder('Password').fill('correcthorse2')
      await clientPage.getByRole('button', { name: 'Continue' }).click()
      await expect(clientPage.getByText('Password required')).not.toBeVisible({ timeout: 10000 })

      // Navigating to a different portal section should NOT re-prompt --
      // getPortalData automatically resends the password confirmed above.
      await clientPage.goto(`/client/${client.portal_token}/contracts`)
      await waitForPortalReady(clientPage)
      await expect(clientPage.getByText('Password required')).not.toBeVisible()
      await clientCtx.close()
    } finally {
      await cleanupClient(client.id)
    }
  })

  test('locks out after repeated wrong attempts, with a live countdown', async ({ page, browser }) => {
    const client = await createTestClient()
    try {
      await setRealPortalPassword(page, client.id, 'correcthorse3')
      const clientCtx = await browser.newContext()
      const clientPage = await clientCtx.newPage()
      await clientPage.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(clientPage)

      // First 5 wrong attempts: rejected, but not yet locked.
      for (let i = 0; i < 5; i++) {
        await clientPage.getByPlaceholder('Password').fill('wrongpassword')
        await clientPage.getByRole('button', { name: 'Continue' }).click()
        await expect(clientPage.getByText('Incorrect password. Please try again.')).toBeVisible()
      }

      // 6th attempt crosses the threshold -- should show the lockout
      // state on THIS response, not the next one (see the get_client_portal_data
      // fix: the lock branch now returns locked:true immediately instead
      // of deferring to the following call).
      await clientPage.getByPlaceholder('Password').fill('wrongpassword')
      await clientPage.getByRole('button', { name: 'Continue' }).click()
      await expect(clientPage.getByText(/Too many attempts\. Try again in/)).toBeVisible()

      // The UI itself disables further submission while locked -- this is
      // the client-side enforcement of the same rule the RPC enforces
      // server-side (verified separately, via SQL, during development:
      // even a correct password is rejected while locked_until is in the
      // future). Confirm the gate actually locks out interaction, not
      // just the message.
      await expect(clientPage.getByPlaceholder('Password')).toBeDisabled()
      await expect(clientPage.getByRole('button', { name: 'Continue' })).toBeDisabled()

      await clientCtx.close()
    } finally {
      await cleanupClient(client.id)
    }
  })
})
