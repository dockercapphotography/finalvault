import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

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

test.use({ storageState: 'tests/.auth/photographer.json' })

// Click the visual toggle div (the pill)
function rowToggle(page, rowLabel) {
  return page.locator('.flex.items-center.justify-between')
    .filter({ hasText: rowLabel })
    .locator('label div.w-8')
    .first()
}

async function waitForSettingsReady(page) {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const titleInput = page.getByPlaceholder('e.g. Smith Wedding — June 2026')
  await expect(titleInput).not.toHaveValue('')
  await page.waitForTimeout(200)
}

test.describe('Gallery Settings', () => {
  let galleryId

  test.beforeEach(async () => {
    const photographerId = await getPhotographerId()
    const { data, error } = await sb().from('galleries').insert({
      photographer_id: photographerId,
      title: 'Settings Test Gallery',
      share_token: `settings-test-${crypto.randomUUID().slice(0, 8)}`,
      is_active: true,
      allow_downloads: true,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)
    galleryId = data.id
  })

  test.afterEach(async () => {
    await sb().from('galleries').delete().eq('id', galleryId)
  })

  test('navigates to settings page', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}`)
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(`/galleries/${galleryId}/settings`)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('shows all tabs', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Access' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sharing' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Display' })).toBeVisible()
  })

  test('saves gallery title on blur', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    const titleInput = page.getByPlaceholder('e.g. Smith Wedding — June 2026')
    await titleInput.fill('Updated Title')
    await titleInput.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('saves client name on blur', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    const clientInput = page.getByPlaceholder('e.g. Sarah & James')
    await clientInput.fill('Jane Doe')
    await clientInput.blur()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggles gallery active status', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await rowToggle(page, 'Gallery active').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to access tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await expect(page.getByText('Password Protection')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Download PIN' })).toBeVisible()
  })

  test('enabling password protection reveals password field', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await rowToggle(page, 'Require password').click()
    await expect(page.getByText('Gallery password')).toBeVisible()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('enabling download PIN reveals PIN field', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Access' }).click()
    await rowToggle(page, 'Require download PIN').click()
    await expect(page.getByRole('heading', { name: 'Download PIN' })).toBeVisible()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to sharing tab', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
    await expect(page.getByText('Client Interactions')).toBeVisible()
  })

  test('toggling allow downloads saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow downloads').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggling allow favorites saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow favorites').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('toggling allow comments saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Sharing' }).click()
    await rowToggle(page, 'Allow comments').click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('switches to display tab and shows color themes', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await expect(page.getByText('Color Theme')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Slate' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dusk' })).toBeVisible()
  })

  test('selecting a color theme saves immediately', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(page.getByText('Changes saved')).toBeVisible()
  })

  test('display tab shows grid options', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Display' }).click()
    await expect(page.getByRole('heading', { name: 'Grid' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Regular' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Large 4 per row' })).toBeVisible()
  })

  test('danger zone shows delete button', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Danger Zone' }).click()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('delete gallery requires confirmation', async ({ page }) => {
    await page.goto(`/galleries/${galleryId}/settings`)
    await waitForSettingsReady(page)
    await page.getByRole('button', { name: 'Danger Zone' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Are you sure?')).toBeVisible()
    await expect(page.getByRole('button', { name: /Yes, delete permanently/ })).toBeVisible()
  })
  // ── show_guide toggle ────────────────────────────────────────────────────────

  test('Sharing tab shows Gallery Guide toggle', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-guide-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Guide Test Gallery',
      share_token: shareToken, is_active: true, show_guide: true,
    }).select().single()
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      await page.getByRole('button', { name: 'Sharing' }).click()
      await expect(page.getByText('Show gallery guide')).toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('toggling show_guide saves immediately', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-guide2-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Guide Toggle Test',
      share_token: shareToken, is_active: true, show_guide: true,
    }).select().single()
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      await page.getByRole('button', { name: 'Sharing' }).click()
      const toggle = rowToggle(page, 'Show gallery guide')
      await toggle.click()
      await page.waitForTimeout(800)
      const { data } = await sb().from('galleries').select('show_guide').eq('id', gallery.id).single()
      expect(data.show_guide).toBe(false)
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  // ── Tags section in General tab ──────────────────────────────────────────────

  test('General tab shows Tags section', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-tags-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Tags Section Test',
      share_token: shareToken, is_active: true, show_guide: false,
    }).select().single()
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      // Tags section is below the fold — scroll to it
      await page.getByText('Tags', { exact: true }).scrollIntoViewIfNeeded()
      await expect(page.getByText('Tags', { exact: true })).toBeVisible()
      await expect(page.getByPlaceholder('Add a tag...')).toBeVisible()
    } finally {
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('can assign an existing tag to a gallery via autocomplete', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-assign-${Date.now()}`
    const tagName = `pw-tag-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Tag Assign Test',
      share_token: shareToken, is_active: true, show_guide: false,
    }).select().single()
    const { data: tag } = await sb().from('gallery_tags').insert({
      photographer_id: photographerId, name: tagName, color: '#6366f1'
    }).select().single()
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      const input = page.getByPlaceholder('Add a tag...')
      await input.click()
      await input.fill(tagName.slice(0, 6))
      await expect(page.getByText(tagName)).toBeVisible({ timeout: 3000 })
      await page.getByText(tagName).first().click()
      await expect(page.getByText(tagName, { exact: false })).toBeVisible()
      await page.waitForTimeout(500)
      const { data } = await sb().from('gallery_tag_assignments').select('id')
        .eq('gallery_id', gallery.id).eq('tag_id', tag.id).maybeSingle()
      expect(data).toBeTruthy()
    } finally {
      await sb().from('gallery_tag_assignments').delete().eq('tag_id', tag.id)
      await sb().from('gallery_tags').delete().eq('id', tag.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('can create a new tag inline via Enter key', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-create-${Date.now()}`
    const tagName = `new-tag-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Tag Create Test',
      share_token: shareToken, is_active: true, show_guide: false,
    }).select().single()
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      const input = page.getByPlaceholder('Add a tag...')
      await input.click()
      await input.fill(tagName)
      await expect(page.getByText(`Create tag "${tagName}"`)).toBeVisible({ timeout: 3000 })
      await input.press('Enter')
      await expect(page.getByText(tagName, { exact: false })).toBeVisible()
      const { data } = await sb().from('gallery_tags').select('id').eq('name', tagName).single()
      expect(data).toBeTruthy()
    } finally {
      const { data: tag } = await sb().from('gallery_tags').select('id').eq('name', tagName).maybeSingle()
      if (tag) {
        await sb().from('gallery_tag_assignments').delete().eq('tag_id', tag.id)
        await sb().from('gallery_tags').delete().eq('id', tag.id)
      }
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('can remove a tag assignment by clicking ×', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const shareToken = `pw-remove-${Date.now()}`
    const tagName = `rm-tag-${Date.now()}`
    const { data: gallery } = await sb().from('galleries').insert({
      photographer_id: photographerId, title: 'Tag Remove Test',
      share_token: shareToken, is_active: true, show_guide: false,
    }).select().single()
    const { data: tag } = await sb().from('gallery_tags').insert({
      photographer_id: photographerId, name: tagName, color: '#6366f1'
    }).select().single()
    await sb().from('gallery_tag_assignments').insert({ gallery_id: gallery.id, tag_id: tag.id })
    try {
      await page.goto(`/galleries/${gallery.id}/settings`)
      await waitForSettingsReady(page)
      // Pill should be visible
      await expect(page.getByText(tagName, { exact: false })).toBeVisible()
      // The × button is inside the pill — look for it next to the tag text
      // Pills render as: [color dot] [tag name] [× button]
      // Target the pill container and click its last button
      const pill = page.locator('button, span').filter({ hasText: new RegExp(`^${tagName}$`) }).first()
      // Pill's × is a sibling button — use the parent container
      await page.locator('div').filter({ hasText: new RegExp(`^${tagName}$`) })
        .getByRole('button').first().click()
      await expect(page.getByText(tagName, { exact: true })).not.toBeVisible({ timeout: 3000 })
    } finally {
      await sb().from('gallery_tag_assignments').delete().eq('tag_id', tag.id)
      await sb().from('gallery_tags').delete().eq('id', tag.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

})
