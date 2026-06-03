import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

// ── Supabase admin client ─────────────────────────────────────────────────────

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

test.use({ storageState: 'tests/.auth/photographer.json' })

const galleryId = FIXTURE_GALLERY.id
const images = FIXTURE_GALLERY.images

// ── Seed / teardown helpers ───────────────────────────────────────────────────

// Hard-wipe all viewer+favorites data for a given email before seeding.
// Prevents stale rows from prior failed runs causing strict-mode violations.
async function cleanupByEmail(email) {
  const client = sb()
  const { data: viewers } = await client
    .from('gallery_viewers')
    .select('id')
    .eq('gallery_id', galleryId)
    .eq('email', email)
  if (!viewers?.length) return
  for (const v of viewers) {
    await client.from('gallery_favorites').delete().eq('viewer_id', v.id)
    await client.from('gallery_activity_log').delete().eq('viewer_id', v.id)
    await client.from('gallery_viewers').delete().eq('id', v.id)
  }
}

async function cleanupByViewerId(viewerId) {
  const client = sb()
  await client.from('gallery_favorites').delete().eq('viewer_id', viewerId)
  await client.from('gallery_activity_log').delete().eq('viewer_id', viewerId)
  await client.from('gallery_viewers').delete().eq('id', viewerId)
}

async function seedFavorites({
  email = 'favtest@example.com',
  displayName = 'Fav Test Client',
  imageIds = [images[0].id, images[1].id],
} = {}) {
  const client = sb()

  const { data: viewer, error: viewerErr } = await client
    .from('gallery_viewers')
    .insert({
      gallery_id: galleryId,
      display_name: displayName,
      email,
      session_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (viewerErr) throw new Error(`Could not create test viewer: ${viewerErr.message}`)

  const { data: favorites, error: favErr } = await client
    .from('gallery_favorites')
    .insert(imageIds.map(imageId => ({
      gallery_id: galleryId,
      viewer_id: viewer.id,
      image_id: imageId,
      created_at: new Date().toISOString(),
    })))
    .select()

  if (favErr) throw new Error(`Could not seed favorites: ${favErr.message}`)

  return { viewer, favoriteIds: favorites.map(f => f.id) }
}

// Navigate to the activity page and wait for it to be ready.
async function gotoActivity(page) {
  await page.goto(`/galleries/${galleryId}/activity`)
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
}

// Click a client card by email.
async function clickCard(page, email) {
  await page.getByRole('button', { name: new RegExp(email) }).first().click()
}

// The panel renders in two DOM slots: mobile (bottom sheet, md:hidden) and
// desktop (right slide-in, hidden md:flex). Both are present simultaneously;
// only one is visible. We scope to the desktop panel — the fixed right-side div
// with width 400 — to avoid strict-mode violations from duplicate text.
function desktopPanel(page) {
  return page.locator('div.fixed.top-0.right-0.bottom-0')
}

async function waitForPanel(page) {
  await expect(desktopPanel(page)).toBeVisible({ timeout: 5000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Client Favorites — Activity Page', () => {

  // ── Section visibility ──────────────────────────────────────────────────────

  test('shows Client Favorites section when favorites exist', async ({ page }) => {
    const email = 'section-visible@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email })
    try {
      await gotoActivity(page)
      await expect(page.getByText('Client favorites')).toBeVisible()
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  test('does not show Client Favorites section when no favorites exist', async ({ page }) => {
    const { data: { users } } = await sb().auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: user.id,
      title: 'No Favorites Gallery',
      is_active: true,
      allow_favorites: true,
    }).select().single()

    try {
      await page.goto(`/galleries/${gallery.id}/activity`)
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Client favorites')).not.toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  // ── Client card content ─────────────────────────────────────────────────────

  test('client card shows viewer email and image count', async ({ page }) => {
    const email = 'card-content@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email, imageIds: [images[0].id, images[1].id] })
    try {
      await gotoActivity(page)
      const card = page.getByRole('button', { name: new RegExp(email) }).first()
      await expect(card).toBeVisible()
      await expect(card).toContainText('2 images')
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  // ── Detail panel ────────────────────────────────────────────────────────────

  test('clicking client card opens detail panel', async ({ page }) => {
    const email = 'panel-open@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)
      // Panel header shows the viewer's email
      await expect(desktopPanel(page).getByText(email)).toBeVisible()
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  test('detail panel shows image filenames', async ({ page }) => {
    const email = 'panel-filenames@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email, imageIds: [images[0].id, images[1].id] })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)
      const panel = desktopPanel(page)
      await expect(panel.getByText(images[0].fileName)).toBeVisible()
      await expect(panel.getByText(images[1].fileName)).toBeVisible()
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  test('detail panel shows a date/time for each favorited image', async ({ page }) => {
    const email = 'panel-dates@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email, imageIds: [images[0].id] })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)
      // formatDateTime produces "Jun 3, 2026, 10:25 AM" style strings
      const panel = desktopPanel(page)
      await expect(panel.getByText(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/).first()).toBeVisible()
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  test('panel closes when backdrop is clicked', async ({ page }) => {
    const email = 'panel-backdrop@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)
      // Click the semi-transparent backdrop (fixed inset-0 z-40 div)
      await page.locator('div.fixed.inset-0').first().click({ position: { x: 10, y: 10 } })
      // Panel slides out after 280ms close animation
      await expect(desktopPanel(page)).not.toBeVisible({ timeout: 2000 })
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  // ── Lightbox ────────────────────────────────────────────────────────────────

  test('clicking thumbnail in panel opens lightbox', async ({ page }) => {
    const email = 'lightbox-open@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email, imageIds: [images[0].id, images[1].id] })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)
      // Thumbnail buttons in PanelContent are <button> elements wrapping a 52×52 <img>.
      // Scope to the desktop panel to avoid any other img-containing buttons on the page.
      const panel = desktopPanel(page)
      const thumbBtn = panel.locator('button').filter({ has: page.locator('img') }).first()
      await thumbBtn.click()
      // Lightbox renders "1 of N" counter text at the bottom
      await expect(page.getByText(/1 of \d+/)).toBeVisible({ timeout: 5000 })
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  test('lightbox nav arrows cycle through favorites', async ({ page }) => {
    const email = 'lightbox-nav@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email, imageIds: [images[0].id, images[1].id, images[2].id] })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)

      // Open lightbox on first thumbnail
      const panel = desktopPanel(page)
      const thumbBtn = panel.locator('button').filter({ has: page.locator('img') }).first()
      await thumbBtn.click()
      await expect(page.getByText('1 of 3')).toBeVisible({ timeout: 5000 })

      // The ChevronRight button is the last button in the lightbox (the fixed inset-0 z-[60] overlay)
      const lightbox = page.locator('div.fixed.inset-0').last()
      await lightbox.locator('button').last().click()
      await expect(page.getByText('2 of 3')).toBeVisible({ timeout: 3000 })
    } finally {
      await cleanupByViewerId(viewer.id)
    }
  })

  // ── Delete ──────────────────────────────────────────────────────────────────

  test('⋮ menu → Delete → confirm removes the client card', async ({ page }) => {
    const email = 'delete-card@example.com'
    await cleanupByEmail(email)
    const { viewer } = await seedFavorites({ email })
    try {
      await gotoActivity(page)
      await clickCard(page, email)
      await waitForPanel(page)

      const panel = desktopPanel(page)

      // The ⋮ menu button is inside the panel header — the flex div at the top with a border-bottom.
      // It's the only button in the header area (the thumbnail buttons are further down in the list).
      // We find it by locating the header div (first child of the panel with a border-bottom style)
      // and clicking its button.
      const panelHeader = panel.locator('div').filter({ hasText: email }).first()
      await panelHeader.locator('button').last().click()

      // The dropdown renders outside normal flow but inside the panel's DOM tree.
      // Wait for it to appear then click the Delete option.
      await expect(panel.getByText('Delete', { exact: true })).toBeVisible({ timeout: 3000 })
      await panel.getByText('Delete', { exact: true }).click()

      // Confirm dialog: two buttons appear — "Delete" (confirm) and "Cancel".
      // Click the first one (the red Delete button).
      await expect(panel.getByRole('button', { name: 'Delete' })).toBeVisible({ timeout: 3000 })
      await panel.getByRole('button', { name: 'Delete' }).first().click()

      // Panel closes and card is removed
      await expect(desktopPanel(page)).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: new RegExp(email) })).not.toBeVisible({ timeout: 3000 })

      // Verify DB rows are gone
      const { data } = await sb()
        .from('gallery_favorites')
        .select('id')
        .eq('viewer_id', viewer.id)
      expect(data.length).toBe(0)
    } finally {
      await sb().from('gallery_viewers').delete().eq('id', viewer.id)
    }
  })

  // ── Multiple clients ────────────────────────────────────────────────────────

  test('shows a card for each client that has favorites', async ({ page }) => {
    const emailA = 'multi-a@example.com'
    const emailB = 'multi-b@example.com'
    await cleanupByEmail(emailA)
    await cleanupByEmail(emailB)
    const { viewer: viewerA } = await seedFavorites({ email: emailA, displayName: 'Client A', imageIds: [images[0].id] })
    const { viewer: viewerB } = await seedFavorites({ email: emailB, displayName: 'Client B', imageIds: [images[1].id] })
    try {
      await gotoActivity(page)
      await expect(page.getByRole('button', { name: new RegExp(emailA) }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: new RegExp(emailB) }).first()).toBeVisible()
    } finally {
      await cleanupByViewerId(viewerA.id)
      await cleanupByViewerId(viewerB.id)
    }
  })

})
