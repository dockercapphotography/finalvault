import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ── Supabase admin client ─────────────────────────────────────────────────────

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Fixture: unauthenticated client page (no photographer auth) ───────────────

const test = base.extend({
  clientPage: async ({ browser }, use) => {
    const ctx = await browser.newContext() // fresh context, no auth state
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  return user.id
}

async function createGuideGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const shareToken = `pw-guide-${Date.now()}`
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'Guide Test Gallery',
    share_token: shareToken,
    is_active: true,
    allow_downloads: true,
    download_watermarked: true,
    allow_hires_download: false,
    allow_favorites: true,
    allow_comments: true,
    show_guide: true,
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return { ...data, shareToken }
}

async function deleteGallery(id) {
  await sb().from('gallery_viewers').delete().eq('gallery_id', id)
  await sb().from('galleries').delete().eq('id', id)
}

async function enterGallery(page, shareToken, email = 'guide-test@example.com') {
  await page.goto(`/g/${shareToken}`)
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
  await page.getByPlaceholder('Enter your email to continue').fill(email)
  await page.getByRole('button', { name: 'View Gallery' }).click()
  await expect(page).toHaveURL(`/g/${shareToken}/view`, { timeout: 10000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Gallery Guide', () => {
  test('guide appears on first visit when show_guide is true', async ({ clientPage }) => {
    const gallery = await createGuideGallery({ show_guide: true })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      // Guide backdrop and modal should appear (400ms delay)
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).toBeVisible({ timeout: 3000 })
      await expect(clientPage.getByText('Welcome to your gallery')).toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('guide does NOT appear when show_guide is false', async ({ clientPage }) => {
    const gallery = await createGuideGallery({ show_guide: false })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      // Guide should not appear
      await clientPage.waitForTimeout(1500) // wait past the 400ms mount delay
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).not.toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('guide does NOT appear if localStorage key is already set', async ({ clientPage }) => {
    const gallery = await createGuideGallery({ show_guide: true })
    try {
      await clientPage.goto(`/g/${gallery.shareToken}`)
      // Set localStorage key before entering
      await clientPage.evaluate((galleryId) => {
        localStorage.setItem(`fv-guide-seen-${galleryId}`, 'true')
      }, gallery.id)
      await enterGallery(clientPage, gallery.shareToken)
      await clientPage.waitForTimeout(1500)
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).not.toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('guide shows correct steps based on enabled features — all enabled', async ({ clientPage }) => {
    const gallery = await createGuideGallery({
      allow_downloads: true,
      allow_favorites: true,
      allow_comments: true,
    })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await expect(clientPage.getByText('Welcome to your gallery')).toBeVisible({ timeout: 3000 })

      // Should have Next button (more than 1 step)
      await expect(clientPage.getByRole('button', { name: 'Next' })).toBeVisible()

      // Step through all steps
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Download your photos')).toBeVisible()
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Pick your favorites')).toBeVisible()
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Leave a comment')).toBeVisible()
      // Final step shows "Go to gallery"
      await expect(clientPage.getByRole('button', { name: 'Go to gallery' })).toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('guide shows only welcome + downloads when favorites and comments disabled', async ({ clientPage }) => {
    const gallery = await createGuideGallery({
      allow_downloads: true,
      allow_favorites: false,
      allow_comments: false,
    })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await expect(clientPage.getByText('Welcome to your gallery')).toBeVisible({ timeout: 3000 })
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Download your photos')).toBeVisible()
      // Should be on final step now
      await expect(clientPage.getByRole('button', { name: 'Go to gallery' })).toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('guide does NOT appear when all features disabled (only welcome step)', async ({ clientPage }) => {
    // When only 1 step (welcome), shouldShow = false, guide skips entirely
    const gallery = await createGuideGallery({
      allow_downloads: false,
      allow_favorites: false,
      allow_comments: false,
    })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await clientPage.waitForTimeout(1500)
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).not.toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('clicking Go to gallery on final step dismisses the guide', async ({ clientPage }) => {
    const gallery = await createGuideGallery({
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: false,
    })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await expect(clientPage.getByText('Welcome to your gallery')).toBeVisible({ timeout: 3000 })
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByRole('button', { name: 'Go to gallery' })).toBeVisible()
      await clientPage.getByRole('button', { name: 'Go to gallery' }).click()
      // Guide should be dismissed
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).not.toBeVisible({ timeout: 1500 })
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('dismissing guide sets localStorage key and prevents re-showing', async ({ clientPage }) => {
    const gallery = await createGuideGallery({ allow_favorites: true })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).toBeVisible({ timeout: 3000 })

      // Dismiss via close button
      await clientPage.getByRole('button', { name: 'Close guide' }).click()
      await clientPage.waitForTimeout(400)

      // localStorage key should be set
      const value = await clientPage.evaluate((galleryId) =>
        localStorage.getItem(`fv-guide-seen-${galleryId}`)
      , gallery.id)
      expect(value).toBeTruthy()

      // Reload — guide should not reappear
      await clientPage.reload()
      await clientPage.waitForLoadState('networkidle')
      await clientPage.waitForTimeout(1500)
      await expect(clientPage.getByRole('button', { name: 'Close guide' })).not.toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })

  test('clicking Next navigates through steps', async ({ clientPage }) => {
    const gallery = await createGuideGallery({ allow_favorites: true })
    try {
      await enterGallery(clientPage, gallery.shareToken)
      await expect(clientPage.getByText('Welcome to your gallery')).toBeVisible({ timeout: 3000 })
      // With allow_favorites=true and allow_downloads defaults to true,
      // step order is: welcome → downloads → favorites
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Download your photos')).toBeVisible()
      await clientPage.getByRole('button', { name: 'Next' }).click()
      await expect(clientPage.getByText('Pick your favorites')).toBeVisible()
    } finally {
      await deleteGallery(gallery.id)
    }
  })
})
