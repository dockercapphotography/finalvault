import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Mirrors tests/e2e/client/gallery-access.spec.js's convention: direct
// service-role inserts for fixture setup, not the app's own crmApi.js
// functions (which call supabase.auth.getUser() internally and expect an
// authenticated browser session -- not callable cleanly from Node-side
// test setup).

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

async function createTestGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'Portal Test Gallery',
    share_token: `portal-test-${crypto.randomUUID().slice(0, 8)}`,
    is_active: true,
    require_password: false,
    allow_downloads: false,
    allow_favorites: true,
    allow_comments: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)

  // gallery_clients is the actual source of truth for portal access as of
  // v1.4.1 -- galleries.client_id is legacy and no longer read by
  // get_client_portal_data. Mirror that here so a fixture created with
  // { client_id: ... } actually shows up in that client's portal, same as
  // a gallery linked through the real app UI would.
  if (data.client_id) {
    const { error: linkError } = await sb().from('gallery_clients').insert({
      gallery_id: data.id,
      client_id: data.client_id,
    })
    if (linkError) throw new Error(linkError.message)
  }

  return data
}

async function createTestSession(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('sessions').insert({
    photographer_id: photographerId,
    name: 'Portal Test Session',
    type: 'Portrait',
    mode: 'private',
    status: 'booked',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function linkGalleryToSession(sessionId, galleryId) {
  const { error } = await sb().from('session_galleries').insert({
    session_id: sessionId,
    gallery_id: galleryId,
    sort_order: 0,
  })
  if (error) throw new Error(error.message)
}

async function createTestViewer(galleryId, email) {
  const { error } = await sb().from('gallery_viewers').insert({
    gallery_id: galleryId,
    session_id: crypto.randomUUID(),
    email,
  })
  if (error) throw new Error(error.message)
}

// Deletes in FK-safe order: children before parents. Accepts whichever
// ids were actually created by a given test rather than assuming all of
// them exist, since not every test creates a session or a viewer.
async function cleanup({ clientId, galleryIds = [], sessionId } = {}) {
  for (const galleryId of galleryIds) {
    await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
    await sb().from('session_galleries').delete().eq('gallery_id', galleryId)
  }
  if (sessionId) await sb().from('sessions').delete().eq('id', sessionId)
  for (const galleryId of galleryIds) {
    await sb().from('galleries').delete().eq('id', galleryId)
  }
  if (clientId) await sb().from('clients').delete().eq('id', clientId)
}

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// Anonymous portal routes -- no auth state should carry over between tests.
test.use({ contextOptions: { storageState: undefined } })

// ── Dedup ─────────────────────────────────────────────────────────────────────

test.describe('Client portal — gallery dedup', () => {
  test('a gallery linked both directly and via session appears exactly once, with session context', async ({ page }) => {
    const client = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const gallery = await createTestGallery({ client_id: client.id })
    await linkGalleryToSession(session.id, gallery.id)

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)

      // Exactly one card for this gallery title, not two.
      await expect(page.getByText('Portal Test Gallery')).toHaveCount(1)
      // Grouped under the session name, not "General" -- proves the
      // dedup logic preferred the session-context row over the bare one,
      // matching the UNION ALL + DISTINCT ON fix (see CLIENT_PORTAL_SPEC.md).
      await expect(page.getByText('Portal Test Session')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id], sessionId: session.id })
    }
  })

  test('a gallery linked only directly (no session) falls into the General group', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('General')).toBeVisible()
      await expect(page.getByText('Portal Test Gallery')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })
})

// ── Expired state ─────────────────────────────────────────────────────────────

test.describe('Client portal — expired galleries', () => {
  test('expired gallery shows grayed out with Expired label, not hidden', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('Portal Test Gallery')).toBeVisible()
      await expect(page.getByText('Expired')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('expired gallery card is not clickable', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      const card = page.getByText('Portal Test Gallery').locator('..')
      // pointer-events: none means the click never navigates away --
      // assert the URL stays put rather than asserting the CSS property
      // directly, since that's the behavior that actually matters.
      await card.click({ force: true }).catch(() => {})
      await expect(page).toHaveURL(`/client/${client.portal_token}/galleries`)
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })
})

// ── "New" badge ───────────────────────────────────────────────────────────────

test.describe('Client portal — New badge', () => {
  test('unviewed gallery shows the New badge', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('New', { exact: true })).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('New badge disappears once a gallery_viewers row exists for the client email', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })
    await createTestViewer(gallery.id, client.email)

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('New', { exact: true })).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })
})

// ── Sort, search, filters ─────────────────────────────────────────────────────

test.describe('Client portal — sort, search, filters', () => {
  test('sort control only appears with more than one gallery', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('Filters & sort')).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('search filters the visible gallery list by title', async ({ page }) => {
    const client = await createTestClient()
    const galleries = await Promise.all([
      createTestGallery({ client_id: client.id, title: 'Spring Portraits' }),
      createTestGallery({ client_id: client.id, title: 'Summer Convention' }),
      createTestGallery({ client_id: client.id, title: 'Fall Family Shoot' }),
      createTestGallery({ client_id: client.id, title: 'Winter Wedding' }),
      createTestGallery({ client_id: client.id, title: 'Holiday Cards' }),
    ])

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await page.getByPlaceholder('Search galleries...').fill('convention')
      await expect(page.getByText('Summer Convention')).toBeVisible()
      await expect(page.getByText('Spring Portraits')).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: galleries.map(g => g.id) })
    }
  })

  test('Show: Active only filter hides expired galleries', async ({ page }) => {
    const client = await createTestClient()
    const active = await createTestGallery({ client_id: client.id, title: 'Active Gallery' })
    const expired = await createTestGallery({
      client_id: client.id, title: 'Expired Gallery',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      // Both the mobile and desktop "Filters & sort" buttons exist in the
      // DOM at once (one hidden via CSS depending on viewport) -- same
      // dual-render pattern as GalleryCard.jsx elsewhere in this project.
      // Scope to :visible rather than picking by DOM order.
      await page.locator('button:visible', { hasText: 'Filters & sort' }).click()
      // Desktop's filter panel uses real <select> elements (DesktopFilterPanel),
      // not tappable rows like the mobile drill-down sheet -- selectOption
      // is the correct interaction here, not a text click. The "Show"
      // label and its <select> are direct siblings inside one wrapping
      // div -- locator('div', { has }) matches every nested ancestor div
      // (caught 3 selects on the first attempt), so this scopes to the
      // label's immediate parent specifically via xpath instead.
      const showField = page.getByText('Show', { exact: true }).locator('xpath=..').locator('select')
      await showField.selectOption('active')
      await expect(page.getByText('Active Gallery')).toBeVisible()
      await expect(page.getByText('Expired Gallery')).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [active.id, expired.id] })
    }
  })
})

// ── Invalid / regenerated token ───────────────────────────────────────────────

test.describe('Client portal — invalid token', () => {
  test('non-existent token shows "link isn\'t valid" rather than crashing', async ({ page }) => {
    await page.goto('/client/this-token-does-not-exist/galleries')
    await waitForPortalReady(page)
    await expect(page.getByText("This link isn't valid")).toBeVisible()
  })

  test('regenerated token invalidates the old one', async ({ page }) => {
    const client = await createTestClient()
    const oldToken = client.portal_token
    const { data: updated } = await sb()
      .from('clients')
      .update({ portal_token: crypto.randomUUID().replace(/-/g, '') })
      .eq('id', client.id)
      .select()
      .single()

    try {
      await page.goto(`/client/${oldToken}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText("This link isn't valid")).toBeVisible()

      await page.goto(`/client/${updated.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText("This link isn't valid")).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id })
    }
  })
})

// ── Gallery access info ─────────────────────────────────────────────────────
// Coverage for the v1.4.4 Access info strip: password/PIN shown per-gallery
// in the portal gallery list, plus the new-tab link behavior added
// alongside it (so the portal, with the codes visible, stays open behind
// the gallery the client is actually looking at).

test.describe('Client portal — gallery access info', () => {
  test('protected gallery shows its password and PIN with working copy buttons', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      require_password: true,
      plain_password: 'gallerypw123',
      require_download_pin: true,
      plain_download_pin: '4242',
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('gallerypw123')).toBeVisible()
      await expect(page.getByText('4242')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy password' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy pin' })).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('unprotected gallery shows no access info', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      require_password: false,
      require_download_pin: false,
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('Portal Test Gallery')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy password' })).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy pin' })).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('gallery links open in a new tab, not in-place', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      const galleryLink = page.getByRole('link', { name: 'Portal Test Gallery' })
      await expect(galleryLink).toHaveAttribute('target', '_blank')
      await expect(galleryLink).toHaveAttribute('rel', /noopener/)
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })
})
