import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { COMMENTS_FIXTURE_GALLERY as FIXTURE_GALLERY, enterGalleryAsClient } from '../../fixtures/fixtures.js'

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

async function cleanupViewerData(galleryId) {
  await sb().from('gallery_comments').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
}

async function openCommentSheet(page) {
  const firstImage = page.locator('.group').first()
  await firstImage.hover()
  // Comment button is nth(1) — after heart button
  await firstImage.locator('button').nth(1).click()
  await expect(page.getByText('Comments', { exact: true })).toBeVisible()
}

test.describe.configure({ mode: "serial" })

test.use({ contextOptions: { storageState: undefined } })

// ── Comments with real images ─────────────────────────────────────────────────

test.describe('Comments — enabled', () => {
  test.afterEach(async () => {
    await cleanupViewerData(FIXTURE_GALLERY.id)
  })

  test('comment icon appears on image hover', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    const firstImage = page.locator('.group').first()
    await firstImage.hover()
    // Comment button is nth(1) in the overlay
    await expect(firstImage.locator('button').nth(1)).toBeVisible()
  })

  test('clicking comment icon opens comment sheet', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    await expect(page.getByPlaceholder('Add a comment…')).toBeVisible()
  })

  test('Post button disabled when comment input is empty', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    await expect(page.getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  test('shows No comments yet when thread is empty', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    await expect(page.getByText('No comments yet')).toBeVisible()
  })

  test('can post a comment and see it in the thread', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    await page.getByPlaceholder('Add a comment…').fill('This is a test comment')
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByText('This is a test comment')).toBeVisible()
  })

  test('comment input clears after posting', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    await page.getByPlaceholder('Add a comment…').fill('Another test comment')
    await page.getByRole('button', { name: 'Post' }).click()
    await expect(page.getByPlaceholder('Add a comment…')).toHaveValue('')
  })

  test('comment sheet closes when clicking backdrop', async ({ page }) => {
    await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken)
    await openCommentSheet(page)
    // The backdrop is the fixed overlay — click outside the sheet panel
    // The sheet is at the bottom; clicking near the top hits the backdrop
    await page.locator('.fixed.inset-0').first().click({ position: { x: 200, y: 100 } })
    await expect(page.getByPlaceholder('Add a comment…')).not.toBeVisible()
  })
})

// ── Comments disabled ─────────────────────────────────────────────────────────

test.describe('Comments — disabled', () => {
  let gallery

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    const shareToken = `test-comments-${crypto.randomUUID().slice(0, 8)}`
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'No Comments Gallery',
      share_token: shareToken,
      is_active: true,
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    gallery = data
  })

  test.afterEach(async () => {
    await sb().from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb().from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb().from('galleries').delete().eq('id', gallery.id)
  })

  test('gallery loads successfully when comments disabled', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await expect(page.getByText('No Comments Gallery').first()).toBeVisible()
  })
})
