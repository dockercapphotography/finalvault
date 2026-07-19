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

// PortalPasswordSection only renders once a portal link exists (portalUrl
// requires client.portal_token), so every fixture here seeds one up front
// rather than exercising the "Generate link" flow first -- that flow is
// already covered elsewhere and isn't what these tests are about.
async function createTestClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Portal',
    last_name: 'PasswordTest',
    email: `portal-pw-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
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

async function waitForClientReady(page, fullName) {
  await expect(page.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 15000 })
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Client portal password — management', () => {
  let client
  let fullName

  test.beforeEach(async () => {
    client = await createTestClient()
    fullName = `${client.first_name} ${client.last_name}`
  })

  test.afterEach(async () => {
    await cleanupClient(client.id)
  })

  test('shows no password set by default', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await expect(page.getByText('No portal password set')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add password' })).toBeVisible()
  })

  test('adds a portal password', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await page.getByRole('button', { name: 'Add password' }).click()
    await page.getByPlaceholder('Enter password').fill('correcthorse')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Portal password added')).toBeVisible()
    await expect(page.getByText('Portal password protection enabled')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
  })

  test('rejects a password under 6 characters', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await page.getByRole('button', { name: 'Add password' }).click()
    await page.getByPlaceholder('Enter password').fill('abc')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Password must be at least 6 characters.')).toBeVisible()
    // Nothing was actually saved -- still shows the unset state underneath the open form
    await expect(page.getByText('No portal password set')).toBeVisible()
  })

  test('changes an existing portal password', async ({ page }) => {
    // Seeding a placeholder hash directly is enough here -- this test only
    // exercises the "already has a password" UI branch and the change
    // flow's own RPC call, not the seeded value itself. The actual
    // crypt-verified round trip is covered by the client-facing gate spec.
    await sb().from('clients').update({ portal_password_hash: 'seed-hash-placeholder' }).eq('id', client.id)
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await expect(page.getByText('Portal password protection enabled')).toBeVisible()
    await page.getByRole('button', { name: 'Change password' }).click()
    await page.getByPlaceholder('Enter password').fill('newpassword1')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Portal password changed')).toBeVisible()
  })

  test('removes portal password protection', async ({ page }) => {
    await sb().from('clients').update({ portal_password_hash: 'seed-hash-placeholder' }).eq('id', client.id)
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await expect(page.getByText('Portal password protection enabled')).toBeVisible()
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Remove password protection? The portal link alone will grant access again.')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText('Portal password removed')).toBeVisible()
    await expect(page.getByText('No portal password set')).toBeVisible()
  })

  test('shows lockout banner and clears it via Reset lockout', async ({ page }) => {
    await sb().from('clients').update({
      portal_password_hash: 'seed-hash-placeholder',
      portal_password_locked_until: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).eq('id', client.id)
    await page.goto(`/clients/${client.id}`)
    await waitForClientReady(page, fullName)
    await expect(page.getByText('Client is currently locked out from too many failed attempts.')).toBeVisible()
    await page.getByRole('button', { name: 'Reset lockout' }).click()
    await expect(page.getByText('Lockout cleared')).toBeVisible()
    await expect(page.getByText('Client is currently locked out from too many failed attempts.')).not.toBeVisible()
  })
})
