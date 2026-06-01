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

async function createGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const shareToken = `test-access-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'Access Test Gallery',
    client_name: 'Test Client',
    share_token: shareToken,
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
  return data
}

async function cleanupGallery(galleryId) {
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

// Wait for the loading spinner to disappear before asserting UI state
async function waitForGateReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// Each test gets a fresh browser context so sessionStorage never bleeds between tests
test.use({ contextOptions: { storageState: undefined } })

// ── Name gate ─────────────────────────────────────────────────────────────────

test.describe('Gallery access — name gate', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery()
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('shows gallery title and name input', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}`)
    await waitForGateReady(page)
    await expect(page.getByText('Access Test Gallery')).toBeVisible()
    await expect(page.getByPlaceholder('Enter your email to continue')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View Gallery' })).toBeVisible()
  })

  test('shows client name below gallery title', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}`)
    await waitForGateReady(page)
    await expect(page.getByText('For Test Client')).toBeVisible()
  })

  test('View Gallery button is disabled when name is empty', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}`)
    await waitForGateReady(page)
    await expect(page.getByRole('button', { name: 'View Gallery' })).toBeDisabled()
  })

  test('enters name and navigates to gallery view', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}`)
    await waitForGateReady(page)
    await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
    await page.getByRole('button', { name: 'View Gallery' }).click()
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })
  })

  test('returning visitor skips name gate', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}`)
    await waitForGateReady(page)
    await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
    await page.getByRole('button', { name: 'View Gallery' }).click()
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })
    await page.goto(`/g/${gallery.share_token}`)
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })
  })
})

// ── Password gate ─────────────────────────────────────────────────────────────

test.describe('Gallery access — password gate', () => {
  test('shows password gate after entering name', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await expect(page.getByText('This gallery is password protected')).toBeVisible()
      await expect(page.getByPlaceholder('Enter gallery password')).toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('shows error on wrong password', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await page.getByPlaceholder('Enter gallery password').fill('wrongpassword')
      await page.getByRole('button', { name: 'Unlock Gallery' }).click()
      await expect(page.getByText('Incorrect password')).toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('unlocks gallery with correct password', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await page.getByPlaceholder('Enter gallery password').fill('supersecret')
      await page.getByRole('button', { name: 'Unlock Gallery' }).click()
      await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('Unlock Gallery button disabled when password is empty', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await expect(page.getByRole('button', { name: 'Unlock Gallery' })).toBeDisabled()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('clears password error when user starts typing again', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await page.getByPlaceholder('Enter gallery password').fill('wrongpassword')
      await page.getByRole('button', { name: 'Unlock Gallery' }).click()
      await expect(page.getByText('Incorrect password')).toBeVisible()
      await page.getByPlaceholder('Enter gallery password').fill('s')
      await expect(page.getByText('Incorrect password')).not.toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })
})

// ── Unavailable states ────────────────────────────────────────────────────────

test.describe('Gallery access — unavailable states', () => {
  test('shows error for inactive gallery', async ({ page }) => {
    const gallery = await createGallery({ is_active: false })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await expect(page.getByText('Could not load gallery')).toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('shows error for expired gallery', async ({ page }) => {
    const gallery = await createGallery({
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await expect(page.getByText('Could not load gallery')).toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('shows error for non-existent token', async ({ page }) => {
    await page.goto(`/g/this-token-does-not-exist`)
    await waitForGateReady(page)
    await expect(page.getByText('Could not load gallery')).toBeVisible()
  })
})

// ── Preview mode ──────────────────────────────────────────────────────────────

test.describe('Gallery access — preview mode', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery()
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('?preview=1 bypasses name gate and goes straight to view', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}?preview=1`)
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view?preview=1`, { timeout: 10000 })
  })

  test('preview mode shows purple preview banner', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}?preview=1`)
    await expect(page).toHaveURL(/preview=1/, { timeout: 10000 })
    await expect(page.getByText('Preview Mode')).toBeVisible()
  })

  test('preview mode bypasses password gate', async ({ page }) => {
    const pwGallery = await createGallery({ require_password: true, plain_password: 'secret' })
    try {
      await page.goto(`/g/${pwGallery.share_token}?preview=1`)
      await expect(page).toHaveURL(`/g/${pwGallery.share_token}/view?preview=1`, { timeout: 10000 })
      await expect(page.getByText('Preview Mode')).toBeVisible()
    } finally {
      await cleanupGallery(pwGallery.id)
    }
  })
})
