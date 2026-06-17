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
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function createTestClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Test',
    last_name: `Client-${uid}`,
    email: `test-${uid}@example.com`,
    phone: '6145550000',
    tags: [],
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestClient(id) {
  await sb().from('contracts').delete().eq('client_id', id)
  await sb().from('clients').delete().eq('id', id)
}

async function createTestTemplate(name = null) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('contract_templates').insert({
    photographer_id: photographerId,
    name: name || `Test Template ${uid}`,
    body: `Hello {{client_name}},\n\nThis is a test contract.\n\nBy signing below, Client confirms they agree.\n\n{{sign_date}}`,
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestTemplate(id) {
  await sb().from('contracts').delete().eq('template_id', id)
  await sb().from('contract_templates').delete().eq('id', id)
}

function pronounsSelect(page) {
  return page.locator('select').filter({ has: page.locator('option[value="she/her"]') }).first()
}

// ── Clients List ──────────────────────────────────────────────────────────────

test.describe('Clients list', () => {
  test('navigates to clients page', async ({ page }) => {
    await page.goto('/clients')
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
  })

  test('shows New Client button', async ({ page }) => {
    await page.goto('/clients')
    await expect(page.getByRole('button', { name: /New Client/i }).first()).toBeVisible()
  })

  test('shows search input', async ({ page }) => {
    await page.goto('/clients')
    await expect(page.locator('input[placeholder="Search clients..."]').first()).toBeVisible()
  })

  test('existing clients appear in list', async ({ page }) => {
    const client = await createTestClient()
    try {
      await page.goto('/clients')
      await expect(page.getByText(client.last_name)).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })

  test('search filters clients by name', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const client = await createTestClient({ first_name: `Search-${uid}`, last_name: 'Person' })
    try {
      await page.goto('/clients')
      // Use the visible search input (desktop = first visible one)
      const search = page.locator('input[placeholder="Search clients..."]').first()
      await search.waitFor({ state: 'visible' })
      await search.fill(`Search-${uid}`)
      await expect(page.getByText(`Search-${uid}`).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })

  test('tags appear on client row', async ({ page }) => {
    const client = await createTestClient({ tags: ['portrait', 'wedding'] })
    try {
      await page.goto('/clients')
      await expect(page.locator('span').filter({ hasText: /^portrait$/ }).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })

  test('pronouns appear next to name on client row', async ({ page }) => {
    const client = await createTestClient({ pronouns: 'she/her' })
    try {
      await page.goto('/clients')
      await expect(page.getByText('she/her').first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })
})

// ── New Client Modal ──────────────────────────────────────────────────────────

test.describe('New Client modal', () => {
  test('opens and shows required fields', async ({ page }) => {
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await expect(page.getByRole('heading', { name: 'New Client' })).toBeVisible()
    await expect(page.getByPlaceholder('Jane').first()).toBeVisible()
    await expect(page.getByPlaceholder('Smith').first()).toBeVisible()
  })

  test('shows pronouns dropdown', async ({ page }) => {
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await expect(pronounsSelect(page)).toBeVisible()
  })

  test('shows tag input', async ({ page }) => {
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await expect(page.getByPlaceholder('Add tag...')).toBeVisible()
  })

  test('Create Client button disabled without name', async ({ page }) => {
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await expect(page.getByRole('button', { name: 'Create Client' })).toBeDisabled()
  })

  test('creates a client and shows in list', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const lastName = `Playwright-${uid}`
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await page.getByPlaceholder('Jane').first().fill('Test')
    await page.getByPlaceholder('Smith').first().fill(lastName)
    await page.getByRole('button', { name: 'Create Client' }).click()
    await expect(page.getByText(lastName).first()).toBeVisible({ timeout: 5000 })

    const photographerId = await getPhotographerId()
    const { data } = await sb().from('clients').select('id').eq('last_name', lastName).eq('photographer_id', photographerId).single()
    if (data) await deleteTestClient(data.id)
  })

  test('creates a client with pronouns', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const lastName = `Pronoun-${uid}`
    await page.goto('/clients')
    await page.getByRole('button', { name: /New Client/i }).first().click()
    await page.getByPlaceholder('Jane').first().fill('Test')
    await page.getByPlaceholder('Smith').first().fill(lastName)
    await pronounsSelect(page).selectOption('they/them')
    await page.getByRole('button', { name: 'Create Client' }).click()
    await expect(page.getByText(lastName).first()).toBeVisible({ timeout: 5000 })

    const photographerId = await getPhotographerId()
    const { data } = await sb().from('clients').select('id, pronouns').eq('last_name', lastName).eq('photographer_id', photographerId).single()
    expect(data?.pronouns).toBe('they/them')
    if (data) await deleteTestClient(data.id)
  })
})

// ── Client Detail ─────────────────────────────────────────────────────────────

test.describe('Client detail', () => {
  let client

  test.beforeEach(async () => {
    client = await createTestClient({
      first_name: 'Jane',
      last_name: 'Doe',
      email: `jane-${crypto.randomUUID().slice(0, 8)}@example.com`,
      phone: '6145551234',
      tags: ['portrait', 'wedding'],
      pronouns: 'she/her',
    })
  })

  test.afterEach(async () => {
    await deleteTestClient(client.id)
  })

  test('navigates to client detail page', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page).toHaveURL(`/clients/${client.id}`)
    await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible()
  })

  test('shows client name and pronouns in header', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('heading', { name: 'Jane Doe' })).toBeVisible()
    await expect(page.getByText('she/her').first()).toBeVisible()
  })

  test('shows client email', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByText(client.email)).toBeVisible()
  })

  test('shows client tags', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.locator('span').filter({ hasText: /^portrait$/ }).first()).toBeVisible()
    await expect(page.locator('span').filter({ hasText: /^wedding$/ }).first()).toBeVisible()
  })

  test('shows Edit button', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('button', { name: /Edit/i }).first()).toBeVisible()
  })

  test('opens edit modal', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Edit Client' })).toBeVisible()
  })

  test('edit modal shows pronouns dropdown', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(pronounsSelect(page)).toBeVisible()
  })

  test('edit modal shows tag input with existing tags', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(page.locator('span').filter({ hasText: /^portrait$/ }).first()).toBeVisible()
    await expect(page.locator('span').filter({ hasText: /^wedding$/ }).first()).toBeVisible()
  })

  test('saves pronoun change', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await pronounsSelect(page).selectOption('he/him')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText('he/him').first()).toBeVisible({ timeout: 5000 })

    const { data } = await sb().from('clients').select('pronouns').eq('id', client.id).single()
    expect(data.pronouns).toBe('he/him')
  })

  test('saves tag addition', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    // TagInput hides placeholder when tags are present — target the input inside it directly
    const tagInput = page.locator('input[style*="min-width"]').last()
    await tagInput.click()
    await tagInput.fill('cosplay')
    await tagInput.press('Enter')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.waitForTimeout(500)

    const { data } = await sb().from('clients').select('tags').eq('id', client.id).single()
    expect(data.tags).toContain('cosplay')
  })

  test('does not show Send Contract button (moved to Sessions in v1.3.0)', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('button', { name: /Send Contract/i })).not.toBeVisible()
  })
})

// ── Send Contract Modal ───────────────────────────────────────────────────────
// NOTE: Send Contract was moved from Client Detail to Sessions in v1.3.0.
// Contract tests now live in sessions.spec.js under Session Detail.

// ── Contract Detail ───────────────────────────────────────────────────────────

test.describe('Contract detail', () => {
  let client
  let contract

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    client = await createTestClient()
    const { data, error } = await sb().from('contracts').insert({
      photographer_id: photographerId,
      client_id: client.id,
      title: 'Test Contract',
      body: 'This is a test contract body.',
      body_hash: 'abc123',
      status: 'sent',
      sign_token: crypto.randomUUID().replace(/-/g, ''),
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    contract = data
  })

  test.afterEach(async () => {
    await sb().from('contracts').delete().eq('id', contract.id)
    await deleteTestClient(client.id)
  })

  test('contract appears in client detail', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByText('Test Contract')).toBeVisible({ timeout: 5000 })
  })

  test('contract row links to contract detail', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByText('Test Contract').first().click()
    await expect(page).toHaveURL(`/contracts/${contract.id}`)
  })

  test('contract detail shows title and status', async ({ page }) => {
    await page.goto(`/contracts/${contract.id}`)
    await expect(page.getByRole('heading', { name: 'Test Contract' })).toBeVisible()
    await expect(page.getByText(/sent/i).first()).toBeVisible()
  })

  test('contract detail shows Resend button for sent contracts', async ({ page }) => {
    await page.goto(`/contracts/${contract.id}`)
    await expect(page.getByRole('button', { name: /Resend/i }).first()).toBeVisible()
  })
})

// ── Account Business Info ─────────────────────────────────────────────────────

test.describe('Account business info', () => {
  test('profile tab shows business fields', async ({ page }) => {
    await page.goto('/account?tab=profile')
    await expect(page.getByPlaceholder('contact@yourstudio.com')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('(555) 000-0000')).toBeVisible()
    await expect(page.getByPlaceholder('123 Main St')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Ohio')).toBeVisible()
  })

  test('business email saves on blur', async ({ page }) => {
    await page.goto('/account?tab=profile')
    const input = page.getByPlaceholder('contact@yourstudio.com')
    await input.fill('test@example.com')
    await input.blur()
    await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 5000 })
  })
})
