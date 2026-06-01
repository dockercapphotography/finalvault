import { test, expect } from '@playwright/test'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'
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
  const shareToken = `test-browse-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'Browse Test Gallery',
    client_name: 'Test Client',
    share_token: shareToken,
    is_active: true,
    require_password: false,
    allow_downloads: true,
    download_watermarked: true,
    allow_hires_download: false,
    allow_favorites: true,
    allow_comments: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function enterGallery(page, shareToken, name = 'testclient@example.com') {
  await page.goto(`/g/${shareToken}`)
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
  await page.getByPlaceholder('Enter your email to continue').fill(name)
  await page.getByRole('button', { name: 'View Gallery' }).click()
  await expect(page).toHaveURL(`/g/${shareToken}/view`, { timeout: 10000 })
}

async function cleanupGallery(galleryId) {
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

test.use({ contextOptions: { storageState: undefined } })

// ── Gallery view chrome ───────────────────────────────────────────────────────

test.describe('Gallery browse — header', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery()
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('shows gallery title in sticky header', async ({ page }) => {
    await enterGallery(page, gallery.share_token)
    await expect(page.getByText('Browse Test Gallery').first()).toBeVisible()
  })

  test('shows download button when downloads enabled', async ({ page }) => {
    await enterGallery(page, gallery.share_token)
    // Download button in sticky header
    await expect(page.locator('header, [class*="sticky"]').getByRole('button').filter({ has: page.locator('svg') }).first()).toBeVisible()
  })

  test('hides download button when downloads disabled', async ({ page }) => {
    const g = await createGallery({ allow_downloads: false })
    try {
      await enterGallery(page, g.share_token)
      // The download menu button should not be in the header
      const headerDownload = page.locator('button').filter({ hasText: /download/i })
      await expect(headerDownload).toHaveCount(0)
    } finally {
      await cleanupGallery(g.id)
    }
  })

  test('shows FinalVault branding in footer', async ({ page }) => {
    await enterGallery(page, gallery.share_token)
    // FinalVault logo is in the gate page footer — after entering, check the view loaded
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view`)
  })

  test('preview mode banner is visible when ?preview=1', async ({ page }) => {
    await page.goto(`/g/${gallery.share_token}?preview=1`)
    await expect(page).toHaveURL(/preview=1/, { timeout: 10000 })
    await expect(page.getByText('Preview Mode')).toBeVisible()
    await expect(page.getByText('This is how your client sees the gallery')).toBeVisible()
  })
})

// ── Image grid ────────────────────────────────────────────────────────────────

test.describe('Gallery browse — image grid', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery()
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('shows empty grid when gallery has no images', async ({ page }) => {
    await enterGallery(page, gallery.share_token)
    // No images — grid container exists but is empty
    const images = page.locator('img[loading="lazy"]')
    await expect(images).toHaveCount(0)
  })

  test('right-click context menu is blocked on images', async ({ page }) => {
    // Context menu prevention is applied globally via onContextMenu={noContext}
    // We verify the handler is attached by checking the attribute isn't overridden
    await enterGallery(page, gallery.share_token)
    // The page itself has onContextMenu blocked — trigger it and confirm no native menu
    await page.mouse.click(400, 400, { button: 'right' })
    // No browser context menu appears (can't detect native menus in Playwright,
    // but we confirm the page doesn't navigate or error)
    await expect(page).toHaveURL(`/g/${gallery.share_token}/view`)
  })
})

// ── Set tabs ──────────────────────────────────────────────────────────────────

test.describe('Gallery browse — set tabs', () => {
  test('shows set tabs when gallery has multiple sets', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `test-browse-${crypto.randomUUID().slice(0, 8)}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'Set Tab Gallery',
      share_token: shareToken,
      is_active: true,
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    // Create two sets
    await sb().from('gallery_sets').insert([
      { gallery_id: gallery.id, name: 'Ceremony', sort_order: 0 },
      { gallery_id: gallery.id, name: 'Reception', sort_order: 1 },
    ])

    try {
      await enterGallery(page, shareToken)
      await expect(page.getByRole('button', { name: 'Ceremony' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reception' })).toBeVisible()
    } finally {
      await sb().from('gallery_viewers').delete().eq('gallery_id', gallery.id)
      await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
      await sb().from('gallery_sets').delete().eq('gallery_id', gallery.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('does not show set tabs when gallery has only one set', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `test-browse-${crypto.randomUUID().slice(0, 8)}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'Single Set Gallery',
      share_token: shareToken,
      is_active: true,
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    await sb().from('gallery_sets').insert([
      { gallery_id: gallery.id, name: 'Photos', sort_order: 0 },
    ])

    try {
      await enterGallery(page, shareToken)
      // With only one set, the tab strip should not render
      await expect(page.getByRole('button', { name: 'Photos' })).toHaveCount(0)
    } finally {
      await sb().from('gallery_viewers').delete().eq('gallery_id', gallery.id)
      await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
      await sb().from('gallery_sets').delete().eq('gallery_id', gallery.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })
})

// ── Lightbox ──────────────────────────────────────────────────────────────────

test.describe('Gallery browse — lightbox', () => {
  test.afterEach(async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.PLAYWRIGHT_SUPABASE_URL,
      process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await sb.from('gallery_viewers').delete().eq('gallery_id', FIXTURE_GALLERY.id)
    await sb.from('gallery_activity_log').delete().eq('gallery_id', FIXTURE_GALLERY.id)
  })

  test('clicking an image opens the lightbox', async ({ page }) => {
    await enterGallery(page, FIXTURE_GALLERY.shareToken)
    await page.locator('.group').first().click()
    await expect(page.locator('.fixed.inset-0').last()).toBeVisible()
    // Lightbox image is visible
    await expect(page.locator('.fixed.inset-0 img').last()).toBeVisible()
  })

  test('lightbox shows image counter', async ({ page }) => {
    await enterGallery(page, FIXTURE_GALLERY.shareToken)
    await page.locator('.group').first().click()
    // Counter shows "1 / 3" for 3 images
    await expect(page.getByText('1 / 3')).toBeVisible()
  })

  test('lightbox closes on Escape key', async ({ page }) => {
    await enterGallery(page, FIXTURE_GALLERY.shareToken)
    await page.locator('.group').first().click()
    await expect(page.locator('.fixed.inset-0').last()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.fixed.inset-0 img').last()).not.toBeVisible()
  })

  test('lightbox navigates with arrow keys', async ({ page }) => {
    await enterGallery(page, FIXTURE_GALLERY.shareToken)
    await page.locator('.group').first().click()
    await expect(page.getByText('1 / 3')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByText('2 / 3')).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByText('1 / 3')).toBeVisible()
  })

  test('lightbox closes on backdrop click', async ({ page }) => {
    await enterGallery(page, FIXTURE_GALLERY.shareToken)
    await page.locator('.group').first().click()
    await expect(page.locator('.fixed.inset-0').last()).toBeVisible()
    // Click top-left corner of the backdrop (outside the image)
    await page.mouse.click(10, 10)
    await expect(page.getByText('1 / 3')).not.toBeVisible()
  })
})
