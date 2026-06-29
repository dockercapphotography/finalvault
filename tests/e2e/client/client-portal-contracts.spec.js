import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    first_name: 'Portal',
    last_name: 'Test',
    email: `portal-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    portal_token: crypto.randomUUID().replace(/-/g, ''),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// Field shape matches tests/e2e/photographer/crm.spec.js's existing
// Contract Detail fixture exactly, plus the signed-state fields this
// portal-specific suite also needs (signed_at, signed_name,
// photographer_signed_at, photographer_signed_name, pdf_r2_key).
async function createTestContract(clientId, overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('contracts').insert({
    photographer_id: photographerId,
    client_id: clientId,
    title: 'Test Contract',
    body: 'This is a test contract body.',
    body_hash: 'abc123',
    status: 'sent',
    sign_token: crypto.randomUUID().replace(/-/g, ''),
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanup({ clientId, contractIds = [] } = {}) {
  for (const id of contractIds) {
    await sb().from('contracts').delete().eq('id', id)
  }
  if (clientId) await sb().from('clients').delete().eq('id', clientId)
}

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

test.use({ contextOptions: { storageState: undefined } })

// ── Three-state bucketing ─────────────────────────────────────────────────────

test.describe('Client portal — contract status buckets', () => {
  test('sent contract shows under "Needs your signature" with a Review & sign link', async ({ page }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, { status: 'sent' })

    try {
      await page.goto(`/client/${client.portal_token}/contracts`)
      await waitForPortalReady(page)
      await expect(page.getByText('Needs your signature')).toBeVisible()
      await expect(page.getByText('Test Contract')).toBeVisible()
      const link = page.getByRole('link', { name: /Review.*sign/ })
      await expect(link).toHaveAttribute('href', `/sign/${contract.sign_token}`)
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })

  test('pending_photographer contract shows under "Awaiting your photographer" with no action button', async ({ page }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, {
      status: 'pending_photographer',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test',
    })

    try {
      await page.goto(`/client/${client.portal_token}/contracts`)
      await waitForPortalReady(page)
      await expect(page.getByText('Awaiting your photographer')).toBeVisible()
      await expect(page.getByText('Test Contract')).toBeVisible()
      await expect(page.getByText('waiting on your photographer')).toBeVisible()
      // The defining fix this bucket exists for: no "Review & sign" link
      // anywhere on the page for a contract the client already signed.
      await expect(page.getByRole('link', { name: /Review.*sign/ })).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })

  test('signed contract shows under "Signed" and links to the detail page', async ({ page }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test',
      photographer_signed_at: new Date().toISOString(),
      photographer_signed_name: 'Nick Porterfield',
    })

    try {
      await page.goto(`/client/${client.portal_token}/contracts`)
      await waitForPortalReady(page)
      await expect(page.getByText('Signed', { exact: true })).toBeVisible()
      await page.getByText('Test Contract').click()
      await expect(page).toHaveURL(`/client/${client.portal_token}/contracts/${contract.id}`)
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })

  test('no "Needs your signature" section when only a pending_photographer contract exists', async ({ page }) => {
    const client = await createTestClient()
    const pendingPhotographer = await createTestContract(client.id, {
      status: 'pending_photographer',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test',
    })

    try {
      await page.goto(`/client/${client.portal_token}/contracts`)
      await waitForPortalReady(page)
      await expect(page.getByText('Needs your signature')).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, contractIds: [pendingPhotographer.id] })
    }
  })
})

// ── Contract detail page ──────────────────────────────────────────────────────

test.describe('Client portal — contract detail', () => {
  test('signed contract detail shows both signatures and omits IP addresses', async ({ page }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test',
      signed_ip: '203.0.113.42',
      photographer_signed_at: new Date().toISOString(),
      photographer_signed_name: 'Nick Porterfield',
      body_hash: 'verifiable-hash-123',
    })

    try {
      await page.goto(`/client/${client.portal_token}/contracts/${contract.id}`)
      await waitForPortalReady(page)
      await expect(page.getByText('Fully signed')).toBeVisible()
      await expect(page.getByText('Nick Porterfield')).toBeVisible()
      // "You" stands in for the client's own name on this page rather
      // than naming them, per the spec's decision on this exact point.
      await expect(page.getByText('You', { exact: true })).toBeVisible()
      // The IP address must not appear anywhere on the page, expanded
      // audit trail included -- this is the actual privacy decision
      // being tested, not just a visual check.
      await page.getByText('View audit trail').click()
      await expect(page.getByText('203.0.113.42')).not.toBeVisible()
      await expect(page.getByText('verifiable-hash-123')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })

  test('a pending contract id has no detail page of its own', async ({ page }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, { status: 'sent' })

    try {
      await page.goto(`/client/${client.portal_token}/contracts/${contract.id}`)
      await waitForPortalReady(page)
      await expect(page.getByText('Contract not found')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })
})

// ── PDF download authorization ────────────────────────────────────────────────
// The real security proof: a token/contract pair that doesn't match must
// not download the file. Verified manually during development (see
// CLIENT_PORTAL_SPEC.md) by pairing one real client's token against
// another real client's signed contract -- this automates exactly that.

test.describe('Client portal — contract PDF download authorization', () => {
  test('missing pdf_r2_key returns a clean not-found, not a silent 200', async ({ request }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test',
      photographer_signed_at: new Date().toISOString(),
      photographer_signed_name: 'Nick Porterfield',
      pdf_r2_key: null,
    })

    try {
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL || 'https://finalvault-worker.sitranephotography.workers.dev'
      const resp = await request.get(`${workerUrl}/contract-pdf/${contract.id}?token=${client.portal_token}`)
      expect(resp.status()).toBe(404)
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })

  test('mismatched token cannot fetch a different client\'s contract PDF', async ({ request }) => {
    const clientA = await createTestClient()
    const clientB = await createTestClient()
    const contractA = await createTestContract(clientA.id, {
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_name: 'Portal Test A',
      photographer_signed_at: new Date().toISOString(),
      photographer_signed_name: 'Nick Porterfield',
      pdf_r2_key: 'photographers/fake/contracts/fake.pdf',
    })

    try {
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL || 'https://finalvault-worker.sitranephotography.workers.dev'
      // Client B's real token, paired with Client A's real contract id.
      const resp = await request.get(`${workerUrl}/contract-pdf/${contractA.id}?token=${clientB.portal_token}`)
      expect(resp.status()).toBe(404)
      const body = await resp.json()
      expect(body.ok).toBe(false)
    } finally {
      await cleanup({ clientId: clientA.id, contractIds: [contractA.id] })
      await cleanup({ clientId: clientB.id })
    }
  })

  test('pending (sent) contract cannot be downloaded even with the matching token', async ({ request }) => {
    const client = await createTestClient()
    const contract = await createTestContract(client.id, {
      status: 'sent',
      pdf_r2_key: null,
    })

    try {
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL || 'https://finalvault-worker.sitranephotography.workers.dev'
      const resp = await request.get(`${workerUrl}/contract-pdf/${contract.id}?token=${client.portal_token}`)
      // The endpoint's query filters status=eq.signed -- a pending
      // contract should never be servable even with a correct token.
      expect(resp.status()).toBe(404)
    } finally {
      await cleanup({ clientId: client.id, contractIds: [contract.id] })
    }
  })
})
