import pathlib

path = pathlib.Path("tests/e2e/photographer/crm.spec.js")
src = path.read_text()

old_import = "import { createClient } from '@supabase/supabase-js'"
assert src.count(old_import) == 1, "import anchor not found or not unique"
new_import = """import { createClient } from '@supabase/supabase-js'
import { FIXTURE_GALLERY } from '../../fixtures/fixtures.js'"""
src = src.replace(old_import, new_import)

old_client_helpers = "async function deleteTestClient(id) {\n  await sb().from('contracts').delete().eq('client_id', id)\n  await sb().from('clients').delete().eq('id', id)\n}"
assert src.count(old_client_helpers) == 1, "deleteTestClient anchor not found or not unique"
new_client_helpers = old_client_helpers + '''

async function createTestGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'CRM Test Gallery',
    share_token: `crm-test-${crypto.randomUUID().slice(0, 8)}`,
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

  if (data.client_id) {
    const { error: linkError } = await sb().from('gallery_clients').insert({
      gallery_id: data.id,
      client_id: data.client_id,
    })
    if (linkError) throw new Error(linkError.message)
  }
  return data
}

async function deleteTestGallery(id) {
  await sb().from('gallery_clients').delete().eq('gallery_id', id)
  await sb().from('galleries').delete().eq('id', id)
}'''
src = src.replace(old_client_helpers, new_client_helpers)

old_tail = '''  test('business email saves on blur', async ({ page }) => {
    await page.goto('/account?tab=profile')
    const input = page.getByPlaceholder('contact@yourstudio.com')
    await input.fill('test@example.com')
    await input.blur()
    await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 5000 })
  })
})'''
assert src.count(old_tail) == 1, "file-tail anchor not found or not unique"

new_tail = old_tail + '''

// ── Client detail — expired gallery badge/image (v1.4.5 regression) ────────────
// A gallery past its expires_at is still is_active:true in the DB -- the
// GalleryRow badge here previously only checked is_active, so it kept
// showing "Active" for an expired gallery, and the cover image request
// never appended allow_expired=1 (which the Worker requires to serve a
// preview for an unavailable gallery), so the cover image silently failed
// to load. Both are fixed in v1.4.5; this guards against either regressing.

test.describe('Client detail — expired gallery display', () => {
  test('shows Expired (not Active) and requests the cover image with allow_expired=1', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      is_active: true,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      cover_r2_key: 'crm-test-fixture-cover.jpg',
    })

    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByRole('heading', { name: `${client.first_name} ${client.last_name}` })).toBeVisible({ timeout: 15000 })

      const galleryRow = page.locator('a').filter({ hasText: gallery.title })
      await expect(galleryRow.getByText('Expired')).toBeVisible()
      await expect(galleryRow.getByText('Active', { exact: true })).not.toBeVisible()
      await expect(galleryRow.locator('img')).toHaveAttribute('src', /allow_expired=1/)
    } finally {
      await deleteTestGallery(gallery.id)
      await deleteTestClient(client.id)
    }
  })

  test('a manually deactivated (non-expired) gallery still shows Inactive, not Expired', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      is_active: false,
      expires_at: null,
    })

    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByRole('heading', { name: `${client.first_name} ${client.last_name}` })).toBeVisible({ timeout: 15000 })

      const galleryRow = page.locator('a').filter({ hasText: gallery.title })
      await expect(galleryRow.getByText('Inactive')).toBeVisible()
      await expect(galleryRow.getByText('Expired')).not.toBeVisible()
    } finally {
      await deleteTestGallery(gallery.id)
      await deleteTestClient(client.id)
    }
  })
})

// ── Client avatar — gallery picker (v1.4.5) ─────────────────────────────────────
// Covers the new "Choose from gallery" path added alongside the existing
// local-file upload: the avatar menu, the two-step gallery -> image picker,
// and that picking an image hands off into the existing crop modal. Uses
// the shared FIXTURE_GALLERY (real images already in R2) linked to a fresh
// test client, rather than creating a new gallery with real uploaded
// images from scratch.

test.describe('Client avatar — gallery picker', () => {
  async function linkClientToFixtureGallery(clientId) {
    const { error } = await sb().from('gallery_clients').insert({
      gallery_id: FIXTURE_GALLERY.id,
      client_id: clientId,
    })
    if (error) throw new Error(error.message)
  }

  async function unlinkClientFromFixtureGallery(clientId) {
    await sb().from('gallery_clients').delete().eq('gallery_id', FIXTURE_GALLERY.id).eq('client_id', clientId)
  }

  test('avatar menu offers Upload photo and Choose from gallery', async ({ page }) => {
    const client = await createTestClient()
    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByRole('heading', { name: `${client.first_name} ${client.last_name}` })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Change photo' }).click()
      await expect(page.getByText('Upload photo')).toBeVisible()
      await expect(page.getByText('Choose from gallery')).toBeVisible()
    } finally {
      await deleteTestClient(client.id)
    }
  })

  test('Choose from gallery shows linked galleries, then that gallery\\'s images, then opens the crop modal', async ({ page }) => {
    const client = await createTestClient()
    await linkClientToFixtureGallery(client.id)

    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByRole('heading', { name: `${client.first_name} ${client.last_name}` })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Change photo' }).click()
      await page.getByText('Choose from gallery').click()

      await expect(page.getByText('Choose from a gallery')).toBeVisible()
      await expect(page.getByText(FIXTURE_GALLERY.title)).toBeVisible()

      await page.getByText(FIXTURE_GALLERY.title).click()
      await expect(page.getByRole('heading', { name: FIXTURE_GALLERY.title })).toBeVisible()

      const firstThumbnail = page.locator('.grid.grid-cols-4 img').first()
      await expect(firstThumbnail).toBeVisible({ timeout: 10000 })
      await firstThumbnail.click()

      await expect(page.getByText('Crop client photo')).toBeVisible()
    } finally {
      await unlinkClientFromFixtureGallery(client.id)
      await deleteTestClient(client.id)
    }
  })

  test('a client with no linked galleries sees an empty state in the picker', async ({ page }) => {
    const client = await createTestClient()
    try {
      await page.goto(`/clients/${client.id}`)
      await expect(page.getByRole('heading', { name: `${client.first_name} ${client.last_name}` })).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'Change photo' }).click()
      await page.getByText('Choose from gallery').click()

      await expect(page.getByText('No linked galleries yet.')).toBeVisible()
    } finally {
      await deleteTestClient(client.id)
    }
  })
})'''

src = src.replace(old_tail, new_tail)
path.write_text(src)
print("Added expired-gallery regression tests and avatar gallery picker tests to crm.spec.js")
