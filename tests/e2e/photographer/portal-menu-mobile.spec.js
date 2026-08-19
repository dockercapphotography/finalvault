import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })

const DESKTOP = { width: 1280, height: 800 }
const MOBILE  = { width: 375,  height: 812 }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

async function gotoDashboard(page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Galleries' })).toBeVisible({ timeout: 10000 })
}

async function createTestGallery(photographerId, overrides = {}) {
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `Portal Menu Test Gallery ${uid}`,
    share_token: `pm-test-${uid}`,
    is_active: true,
    allow_downloads: true,
    allow_favorites: true,
    allow_comments: true,
    ...overrides,
  }).select().single()
  if (error) throw new Error(`Could not create gallery: ${error.message}`)
  return data
}

async function createTestFolder(photographerId, name, parentId = null) {
  const { data, error } = await sb().from('gallery_folders')
    .insert({ name, parent_id: parentId, photographer_id: photographerId })
    .select().single()
  if (error) throw new Error(`Could not create folder: ${error.message}`)
  return data
}

async function cleanupFolder(id) {
  await sb().rpc('delete_folder_tree', { root_folder_id: id })
}

async function createTestGalleryWithSets(photographerId) {
  const uid = crypto.randomUUID().slice(0, 8)
  const { data: gallery, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `Portal Menu Sets Gallery ${uid}`,
    share_token: `pm-sets-${uid}`,
    is_active: true,
    allow_downloads: true,
    allow_favorites: true,
    allow_comments: true,
  }).select().single()
  if (error) throw new Error(error.message)

  const { data: setA, error: setAError } = await sb().from('gallery_sets')
    .insert({ gallery_id: gallery.id, name: 'Previews', sort_order: 0 }).select().single()
  if (setAError) throw new Error(setAError.message)

  const { data: setB, error: setBError } = await sb().from('gallery_sets')
    .insert({ gallery_id: gallery.id, name: 'Edited', sort_order: 1 }).select().single()
  if (setBError) throw new Error(setBError.message)

  return { gallery, setA, setB }
}

async function createTestImage(photographerId, galleryId, setId) {
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('gallery_images').insert({
    gallery_id: galleryId,
    photographer_id: photographerId,
    set_id: setId,
    original_r2_key: `photographers/${photographerId}/test/${uid}_original.jpg`,
    preview_r2_key: `photographers/${photographerId}/test/${uid}_preview.webp`,
    file_name: `test-${uid}.jpg`,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestGalleryWithSets(galleryId) {
  await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_sets').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

// Scopes to the specific gallery's card (desktop or mobile variant,
// whichever is CSS-visible at the current viewport) via data-gallery-id
// -- the account this suite runs against has many pre-existing galleries,
// so an unscoped "Gallery menu" query would match the wrong one.
function galleryMenuButton(page, galleryId) {
  return page.locator(`[data-gallery-id="${galleryId}"]`).locator('visible=true')
    .getByRole('button', { name: 'Gallery menu', exact: true })
}

// ── Gallery card ⋮ menu: mobile vs desktop rendering ────────────────────────

test.describe('PortalMenu — mobile vs desktop rendering', () => {
  test('gallery card ⋮ menu renders as a bottom sheet on mobile', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const gallery = await createTestGallery(photographerId)
    try {
      await page.setViewportSize(MOBILE)
      await gotoDashboard(page)
      await galleryMenuButton(page, gallery.id).click()
      await expect(page.getByTestId('bottom-sheet')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Quick Edit', exact: true })).toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('gallery card ⋮ menu renders as a dropdown (not a bottom sheet) on desktop', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const gallery = await createTestGallery(photographerId)
    try {
      await page.setViewportSize(DESKTOP)
      await gotoDashboard(page)
      await galleryMenuButton(page, gallery.id).click()
      await expect(page.getByTestId('bottom-sheet')).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'Quick Edit', exact: true })).toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })
})

// ── In-sheet delete confirmation ─────────────────────────────────────────────

test.describe('PortalMenu — mobile in-sheet delete confirmation', () => {
  test('tapping Delete shows an in-sheet confirmation; Cancel returns to the menu', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const gallery = await createTestGallery(photographerId)
    try {
      await page.setViewportSize(MOBILE)
      await gotoDashboard(page)
      await galleryMenuButton(page, gallery.id).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Same sheet, not a separate screen or a new modal
      await expect(page.getByTestId('bottom-sheet')).toBeVisible()
      await expect(page.getByText(`Delete "${gallery.title}"?`)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Cancel', exact: true }).click()

      // Back to the item list, sheet still open
      await expect(page.getByRole('button', { name: 'Quick Edit', exact: true })).toBeVisible()
      await expect(page.getByTestId('bottom-sheet')).toBeVisible()

      const { data } = await sb().from('galleries').select('id').eq('id', gallery.id).maybeSingle()
      expect(data).not.toBeNull()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('confirming Delete in the sheet actually deletes the gallery', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const gallery = await createTestGallery(photographerId)
    try {
      await page.setViewportSize(MOBILE)
      await gotoDashboard(page)
      await galleryMenuButton(page, gallery.id).click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText(`Delete "${gallery.title}"?`)).toBeVisible()

      // Only the confirm button is in the DOM at this point (item list is
      // fully replaced, not stacked), so this is unambiguous even though
      // the menu item was also labeled "Delete".
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // The sheet closing is just a CSS transition, independent of
      // whether the (async) delete call has actually finished -- wait
      // for the card itself to disappear, driven by the real deletion.
      await expect(page.locator(`[data-gallery-id="${gallery.id}"]`)).toHaveCount(0, { timeout: 5000 })
      const { data } = await sb().from('galleries').select('id').eq('id', gallery.id).maybeSingle()
      expect(data).toBeNull()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })
})

// ── Async confirm (FolderCard's real subfolder/gallery counts) ──────────────

test.describe('PortalMenu — async confirm with loading state', () => {
  test('folder delete confirmation shows real subfolder/gallery counts after loading', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const folder = await createTestFolder(photographerId, 'Portal Menu Async Folder')
    const subfolder = await createTestFolder(photographerId, 'Portal Menu Async Subfolder', folder.id)
    const gallery = await createTestGallery(photographerId, { folder_id: folder.id })
    try {
      await page.setViewportSize(MOBILE)
      await gotoDashboard(page)

      const card = page.locator('.rounded-xl').filter({
        has: page.locator('h3').filter({ hasText: 'Portal Menu Async Folder' }),
      }).first()
      const menuBtn = card.getByRole('button', { name: 'Folder menu', exact: true }).locator('visible=true')
      await menuBtn.click()
      await expect(page.getByTestId('bottom-sheet')).toBeVisible()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Resolves from a loading state to the real fetched counts -- not
      // asserting the spinner itself (timing-fragile), just that the
      // final message reflects real data, not a placeholder.
      await expect(page.getByText(/This will also delete 1 folder and 1 gallery/)).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()

      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeVisible()
    } finally {
      await cleanupFolder(folder.id)
    }
  })
})

// ── Submenu → PickerModal (not an inline flyout) ─────────────────────────────

test.describe('PortalMenu — mobile submenu opens PickerModal', () => {
  test('Move to Set opens a picker modal instead of an inline flyout', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const { gallery, setA, setB } = await createTestGalleryWithSets(photographerId)
    const image = await createTestImage(photographerId, gallery.id, setA.id)
    try {
      await page.setViewportSize(MOBILE)
      await page.goto(`/galleries/${gallery.id}`)
      // Wait for the image (and its menu trigger) to actually render,
      // rather than the set tab's text -- "Previews" as a search string
      // would also match the new "Previews set options" trigger label.
      const imageMenuBtn = page.getByRole('button', { name: 'Image menu', exact: true }).locator('visible=true')
      await expect(imageMenuBtn).toBeVisible({ timeout: 15000 })

      await imageMenuBtn.click()
      await expect(page.getByTestId('bottom-sheet')).toBeVisible()

      await page.getByRole('button', { name: 'Move to Set', exact: true }).click()

      // Sheet closes, picker modal takes over -- not an inline flyout
      await expect(page.getByTestId('bottom-sheet')).not.toBeVisible()
      await expect(page.getByTestId('picker-modal')).toBeVisible()
      const pickerModal = page.getByTestId('picker-modal')
      await expect(pickerModal.getByRole('button', { name: setB.name, exact: true })).toBeVisible()

      // Scoped to the modal -- the underlying gallery page still has its
      // own set-tab button with the same text ("Edited") visible behind
      // the overlay, and an unscoped click could hit that instead.
      await pickerModal.getByRole('button', { name: setB.name, exact: true }).click()
      await expect(page.getByTestId('picker-modal')).not.toBeVisible({ timeout: 5000 })

      // The move itself (onMoveToSet -> handleMoveImage) is async and
      // isn't awaited anywhere in the click chain -- the modal closing is
      // just its own UI state, unrelated to whether the underlying
      // Supabase update has actually finished. Wait for the success toast
      // it fires on completion before checking the database.
      await expect(page.getByText('Image moved')).toBeVisible({ timeout: 5000 })

      const { data } = await sb().from('gallery_images').select('set_id').eq('id', image.id).single()
      expect(data.set_id).toBe(setB.id)
    } finally {
      await deleteTestGalleryWithSets(gallery.id)
    }
  })
})
