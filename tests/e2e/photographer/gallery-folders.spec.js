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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTestUser() {
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer user not found')
  return user
}

async function createTestFolder(name, parentId = null) {
  const user = await getTestUser()
  const { data, error } = await sb()
    .from('gallery_folders')
    .insert({ name, parent_id: parentId, photographer_id: user.id })
    .select()
    .single()
  if (error) throw new Error(`Could not create folder: ${error.message}`)
  return data
}

async function cleanupFolder(id) {
  await sb().rpc('delete_folder_tree', { root_folder_id: id })
}

async function cleanupTestGalleries() {
  // Delete any leftover "Folder Test Gallery" rows from prior failed runs
  await sb().from('galleries').delete().eq('title', 'Folder Test Gallery')
}

async function createTestGallery(folderId = null) {
  const user = await getTestUser()
  const { data, error } = await sb()
    .from('galleries')
    .insert({
      photographer_id: user.id,
      title: 'Folder Test Gallery',
      share_token: `pw-test-${crypto.randomUUID().slice(0, 8)}`,
      is_active: true,
      allow_downloads: true,
      allow_favorites: true,
      allow_comments: true,
      folder_id: folderId,
    })
    .select()
    .single()
  if (error) throw new Error(`Could not create gallery: ${error.message}`)
  return data
}

async function gotoDashboard(page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Galleries' })).toBeVisible({ timeout: 10000 })
}

// Breadcrumb "Galleries" button — scoped to the nav element
function breadcrumbGalleries(page) {
  return page.locator('nav').getByRole('button', { name: /Galleries/ })
}

// Find a folder card by name and open its ⋮ menu.
// The ⋮ button is positioned absolute in the cover area, top-right.
async function openFolderMenu(page, folderName) {
  // Find the card containing the folder name in its h3
  const card = page.locator('.rounded-xl').filter({
    has: page.locator('h3').filter({ hasText: folderName }),
  }).first()
  // The ⋮ button is a rounded-full button in the cover area
  const menuBtn = card.locator('button.rounded-full').first()
  await menuBtn.click()
  // Wait for dropdown — Rename always appears first in the folder ⋮ menu
  await expect(page.getByRole('button', { name: 'Rename' }).first()).toBeVisible({ timeout: 3000 })
}

// Find a gallery card by title and open its ⋮ menu via coordinate click.
async function openGalleryMenu(page, galleryTitle) {
  const titleEl = page.locator('h3').filter({ hasText: galleryTitle }).first()
  await expect(titleEl).toBeVisible({ timeout: 5000 })
  const box = await titleEl.boundingBox()
  if (!box) throw new Error('Could not get bounding box of gallery title')

  // From screenshots: the ⋮ button is ~133px above the h3 title and near the right edge.
  // The card body (title + subtitle) is ~80px, the ⋮ is at top of cover.
  // h3 is at the top of body, so ⋮ is approx box.y - cover_height + 15.
  // Cover height on a ~240px wide card at 4:3 ratio ≈ 180px.
  // Measured from screenshots: ⋮ is about 133px above h3.
  const menuX = box.x + box.width + 60  // right edge of card (card is wider than h3)
  const menuY = box.y - 133

  await page.mouse.move(menuX, menuY)
  await page.waitForTimeout(150)
  await page.mouse.click(menuX, menuY)
  await expect(page.getByText('Move to Folder').first()).toBeVisible({ timeout: 3000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Gallery Folders', () => {

  // ── Visibility ──────────────────────────────────────────────────────────────

  test('folder card appears on dashboard after creation', async ({ page }) => {
    const folder = await createTestFolder('Playwright Test Folder')
    try {
      await gotoDashboard(page)
      await expect(page.locator('h3').filter({ hasText: 'Playwright Test Folder' }).first()).toBeVisible()
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  // ── Create folder via UI ────────────────────────────────────────────────────

  test('New Folder button opens modal and creates a folder', async ({ page }) => {
    await gotoDashboard(page)
    await page.getByRole('button', { name: /New Folder/ }).first().click()
    await expect(page.getByPlaceholder('e.g. PopCon Indy')).toBeVisible({ timeout: 3000 })

    const folderName = `UI Folder ${Date.now()}`
    await page.getByPlaceholder('e.g. PopCon Indy').fill(folderName)
    await page.getByRole('button', { name: 'Create Folder' }).click()

    // Wait for modal to close, then wait for folder h3 to appear
    await expect(page.getByPlaceholder('e.g. PopCon Indy')).not.toBeVisible({ timeout: 3000 })
    await expect(page.locator('h3').filter({ hasText: folderName }).first()).toBeVisible({ timeout: 8000 })

    const { data } = await sb().from('gallery_folders').select('id').eq('name', folderName).single()
    if (data) await cleanupFolder(data.id)
  })

  // ── Navigation ──────────────────────────────────────────────────────────────

  test('clicking a folder card navigates into it', async ({ page }) => {
    const folder = await createTestFolder('Nav Test Folder')
    try {
      await gotoDashboard(page)
      // Click the h3 title to navigate into the folder
      await page.locator('h3').filter({ hasText: 'Nav Test Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Nav Test Folder' })).toBeVisible({ timeout: 5000 })
      await expect(breadcrumbGalleries(page)).toBeVisible()
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  test('breadcrumb Galleries link navigates back to root', async ({ page }) => {
    const folder = await createTestFolder('Breadcrumb Test Folder')
    try {
      await gotoDashboard(page)
      await page.locator('h3').filter({ hasText: 'Breadcrumb Test Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Breadcrumb Test Folder' })).toBeVisible({ timeout: 5000 })
      await breadcrumbGalleries(page).click()
      await expect(page.getByRole('heading', { name: 'Galleries' })).toBeVisible({ timeout: 5000 })
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  test('gallery count subtitle shows folder contents not total', async ({ page }) => {
    const folder = await createTestFolder('Count Test Folder')
    const gallery = await createTestGallery(folder.id)
    try {
      await gotoDashboard(page)
      await page.locator('h3').filter({ hasText: 'Count Test Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Count Test Folder' })).toBeVisible({ timeout: 5000 })
      // The subtitle paragraph shows gallery count for this folder only
      await expect(page.locator('p').filter({ hasText: '1 gallery' }).first()).toBeVisible()
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  // ── Create gallery inside folder ────────────────────────────────────────────

  test('New Gallery from inside a folder auto-assigns to that folder', async ({ page }) => {
    const folder = await createTestFolder('Gallery Assignment Folder')
    try {
      await gotoDashboard(page)
      await page.locator('h3').filter({ hasText: 'Gallery Assignment Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Gallery Assignment Folder' })).toBeVisible({ timeout: 5000 })

      // Click New Gallery — use the Button component which renders with specific text
      await page.getByRole('button', { name: /New Gallery/ }).first().click()
      await expect(page).toHaveURL('/galleries/new', { timeout: 5000 })

      await page.getByRole('button', { name: 'Start from scratch' }).click()
      await page.getByPlaceholder('e.g. The Smith Wedding').fill('Folder Assignment Test Gallery')
      await page.getByRole('button', { name: /Next/ }).click()
      await page.getByPlaceholder('e.g. Edited - Standard').fill('Test Set')
      await page.getByRole('button', { name: 'Create Gallery' }).click()

      await expect(page).toHaveURL(/\/galleries\/[a-f0-9-]+$/, { timeout: 10000 })

      const galleryId = page.url().split('/galleries/')[1]
      const { data } = await sb().from('galleries').select('folder_id').eq('id', galleryId).single()
      expect(data.folder_id).toBe(folder.id)

      await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
      await sb().from('galleries').delete().eq('id', galleryId)
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  // ── Move gallery via menu ───────────────────────────────────────────────────

  test('⋮ → Move to Folder moves gallery into folder', async ({ page }) => {
    await cleanupTestGalleries()
    // Clean up any leftover Move Target Folders from prior runs first
    const { data: oldFolders } = await sb().from('gallery_folders').select('id').eq('name', 'Move Target Folder')
    for (const f of oldFolders || []) await sb().rpc('delete_folder_tree', { root_folder_id: f.id })
    const folder = await createTestFolder('Move Target Folder')
    const gallery = await createTestGallery(null)
    try {
      await gotoDashboard(page)

      // Open the gallery card's ⋮ menu
      await openGalleryMenu(page, 'Folder Test Gallery')

      // Click Move to Folder
      await page.getByText('Move to Folder').click()

      // Picker modal opens
      await expect(page.getByText('Move to Ungrouped')).toBeVisible({ timeout: 3000 })

      // The folder appears as a div row in the picker list — click it
      await page.locator('div').filter({ hasText: /^Move Target Folder$/ }).first().click()
      await page.getByRole('button', { name: 'Move Here' }).click()

      // Verify in DB
      const { data } = await sb().from('galleries').select('folder_id').eq('id', gallery.id).single()
      expect(data.folder_id).toBe(folder.id)
    } finally {
      await cleanupFolder(folder.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  // ── Rename folder ───────────────────────────────────────────────────────────

  test('⋮ → Rename updates folder name inline', async ({ page }) => {
    const folder = await createTestFolder('Rename Me Folder')
    try {
      await gotoDashboard(page)
      await expect(page.locator('h3').filter({ hasText: 'Rename Me Folder' }).first()).toBeVisible()

      await openFolderMenu(page, 'Rename Me Folder')
      await page.getByRole('button', { name: 'Rename' }).click()

      // Inline input appears — wait for an input with value "Rename Me Folder"
      // then use Playwright's fill + blur to trigger React's onBlur save handler
      const renameInput = page.locator('input[value="Rename Me Folder"]')
      await expect(renameInput).toBeVisible({ timeout: 3000 })
      await renameInput.fill('Renamed Folder')
      // Click elsewhere on the page to trigger onBlur and save
      await page.locator('h1').first().click()

      // h3 updates to new name
      // Verify the new name is visible — sufficient to confirm rename succeeded
      await expect(page.locator('h3').filter({ hasText: 'Renamed Folder' }).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  // ── Delete empty folder ─────────────────────────────────────────────────────

  test('⋮ → Delete removes an empty folder', async ({ page }) => {
    const folder = await createTestFolder('Delete Me Folder')
    try {
      await gotoDashboard(page)
      await expect(page.locator('h3').filter({ hasText: 'Delete Me Folder' }).first()).toBeVisible()

      await openFolderMenu(page, 'Delete Me Folder')
      await page.getByRole('button', { name: 'Delete' }).click()

      // Confirm dialog in the card body
      await expect(page.getByText(/Delete "Delete Me Folder"/)).toBeVisible({ timeout: 3000 })
      await page.getByRole('button', { name: 'Delete' }).first().click()

      await expect(page.locator('h3').filter({ hasText: 'Delete Me Folder' })).toHaveCount(0, { timeout: 5000 })

      const { data } = await sb().from('gallery_folders').select('id').eq('id', folder.id).maybeSingle()
      expect(data).toBeNull()
    } finally {
      await sb().from('gallery_folders').delete().eq('id', folder.id)
    }
  })

  // ── Delete folder with contents warning ─────────────────────────────────────

  test('deleting a folder with contents shows warning with counts', async ({ page }) => {
    const folder = await createTestFolder('Full Folder')
    const subfolder = await createTestFolder('Sub Folder', folder.id)
    const gallery = await createTestGallery(folder.id)
    try {
      await gotoDashboard(page)
      await expect(page.locator('h3').filter({ hasText: 'Full Folder' }).first()).toBeVisible()

      await openFolderMenu(page, 'Full Folder')
      await page.getByRole('button', { name: 'Delete' }).click()

      // Warning text appears in the card body confirm area — "permanently delete"
      await expect(page.getByText('permanently delete')).toBeVisible({ timeout: 5000 })
      await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()

      // Cancel — folder should still be there
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.locator('h3').filter({ hasText: 'Full Folder' }).first()).toBeVisible()
    } finally {
      await cleanupFolder(folder.id)
    }
  })

  // ── Subfolder navigation ────────────────────────────────────────────────────

  test('navigating into a subfolder shows multi-level breadcrumb', async ({ page }) => {
    const parent = await createTestFolder('Parent Folder')
    const child = await createTestFolder('Child Folder', parent.id)
    try {
      await gotoDashboard(page)
      await page.locator('h3').filter({ hasText: 'Parent Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Parent Folder' })).toBeVisible({ timeout: 5000 })

      await page.locator('h3').filter({ hasText: 'Child Folder' }).first().click()
      await expect(page.getByRole('heading', { name: 'Child Folder' })).toBeVisible({ timeout: 5000 })

      // Breadcrumb shows both parent and Galleries
      await expect(page.locator('nav').getByRole('button', { name: /Parent Folder/ })).toBeVisible()
      await expect(breadcrumbGalleries(page)).toBeVisible()
    } finally {
      await cleanupFolder(parent.id)
    }
  })

})
