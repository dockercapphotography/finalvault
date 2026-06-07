import { test, expect } from '../../../tests/fixtures/fixtures.js'
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
  return user.id
}

async function cleanupTestTags(photographerId) {
  await sb()
    .from('gallery_tags')
    .delete()
    .eq('photographer_id', photographerId)
    .like('name', 'pw-%')
}

async function goToTagsTab(page) {
  await page.goto('/account?tab=tags')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Gallery Tags')).toBeVisible({ timeout: 5000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Account — Tags', () => {
  let photographerId

  test.beforeAll(async () => {
    photographerId = await getPhotographerId()
  })

  test.afterEach(async () => {
    await cleanupTestTags(photographerId)
  })

  test('Tags tab appears in Account navigation', async ({ page }) => {
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Tags' })).toBeVisible()
  })

  test('Tags tab shows tag library section', async ({ page }) => {
    await goToTagsTab(page)
    await expect(page.getByText('Gallery Tags')).toBeVisible()
    await expect(page.getByPlaceholder(/Tag name/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
  })

  test('can create a tag', async ({ page }) => {
    await goToTagsTab(page)

    const tagName = `pw-tag-${Date.now()}`
    await page.getByPlaceholder(/Tag name/i).fill(tagName)
    await page.getByRole('button', { name: 'Create' }).click()

    // Tag appears in the list
    await expect(page.getByText(tagName)).toBeVisible({ timeout: 5000 })
    // Usage count starts at 0
    await expect(page.getByText('0 galleries')).toBeVisible()
  })

  test('created tag shows usage count "0 galleries"', async ({ page }) => {
    const tagName = `pw-usage-${Date.now()}`
    await sb().from('gallery_tags').insert({ photographer_id: photographerId, name: tagName, color: '#6366f1' })

    await goToTagsTab(page)
    await expect(page.getByText(tagName)).toBeVisible()
    await expect(page.getByText('0 galleries')).toBeVisible()
  })

  test('can rename a tag via pencil icon', async ({ page }) => {
    const tagName = `pw-rename-${Date.now()}`
    await sb().from('gallery_tags').insert({ photographer_id: photographerId, name: tagName, color: '#6366f1' })

    await goToTagsTab(page)
    await expect(page.getByText(tagName)).toBeVisible()

    // Click pencil icon on the tag row — scope tightly to the tag list row
    // The tag list row is inside the SettingsSection, not the header area
    await expect(page.getByText(tagName)).toBeVisible()
    // Scroll the tag into view then click its pencil button
    // The pencil button renders an SVG with no text — find it by position in the row
    // Row structure: color-dot | name | pencil-btn | x-btn
    // We hover over the tag name to find its sibling pencil button
    const tagNameEl = page.locator('span').filter({ hasText: new RegExp(`^${tagName}$`) }).first()
    await tagNameEl.scrollIntoViewIfNeeded()
    // Pencil button is immediately after the tag name span in its flex row
    // Use the parent div's buttons, but exclude the "Create" button at top
    const tagListRow = page.locator('div.flex.items-center.gap-3').filter({ hasText: tagName }).first()
    await expect(tagListRow).toBeVisible({ timeout: 3000 })
    await tagListRow.getByRole('button').first().click() // first button = pencil

    // Edit input appears with autoFocus
    await page.waitForTimeout(300)
    const editInput = page.locator('input[type="text"]').filter({ hasText: '' }).last()
    await expect(editInput).toBeVisible({ timeout: 3000 })
    await editInput.fill(`${tagName}-renamed`)
    await page.getByRole('button', { name: 'Save' }).click()

    // Renamed tag appears
    await expect(page.getByText(`${tagName}-renamed`)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(tagName, { exact: true })).not.toBeVisible()
  })

  test('can delete a tag', async ({ page }) => {
    const tagName = `pw-delete-${Date.now()}`
    await sb().from('gallery_tags').insert({ photographer_id: photographerId, name: tagName, color: '#6366f1' })

    await goToTagsTab(page)
    await expect(page.getByText(tagName)).toBeVisible()

    // Find the tag row and click the X (delete) button
    // Tag row has: color dot | name | pencil button | X button
    // Scope to the specific tag name row to avoid matching other rows
    const tagRow = page.locator('div.flex.items-center').filter({ hasText: tagName }).first()
    await tagRow.locator('button').last().click()

    // Confirm row shows tag name with quotes and Delete/Cancel buttons
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()

    // Tag is gone
    await expect(page.getByText(tagName, { exact: true })).not.toBeVisible({ timeout: 3000 })
  })

  test('delete confirmation shows usage count when tag is in use', async ({ page }) => {
    const tagName = `pw-inuse-${Date.now()}`
    const { data: tag } = await sb()
      .from('gallery_tags')
      .insert({ photographer_id: photographerId, name: tagName, color: '#6366f1' })
      .select()
      .single()

    // Create a gallery and assign the tag to inflate usage count
    const { data: gallery } = await sb()
      .from('galleries')
      .insert({
        photographer_id: photographerId,
        title: 'Tag Usage Test Gallery',
        share_token: `pw-test-${Date.now()}`,
        is_active: true,
        show_guide: false,
      })
      .select()
      .single()
    await sb().from('gallery_tag_assignments').insert({ gallery_id: gallery.id, tag_id: tag.id })

    try {
      await goToTagsTab(page)
      await expect(page.getByText(tagName)).toBeVisible()

      const tagRow = page.locator('div').filter({ hasText: tagName }).first()
      await tagRow.getByRole('button').last().click()

      // Usage count shown in confirm row
      await expect(page.getByText(/1 gallery/)).toBeVisible({ timeout: 3000 })
    } finally {
      await sb().from('gallery_tag_assignments').delete().eq('tag_id', tag.id)
      await sb().from('galleries').delete().eq('id', gallery.id)
    }
  })

  test('empty state shows when no tags exist', async ({ page }) => {
    // Ensure no pw- tags exist
    await cleanupTestTags(photographerId)

    await goToTagsTab(page)
    // If photographer has no tags at all, show empty state
    // (only reliable if test account has no other tags)
    const tagCount = await page.locator('div').filter({ hasText: /\d+ gallerI/ }).count()
    if (tagCount === 0) {
      await expect(page.getByText('No tags yet')).toBeVisible()
    }
    // Otherwise just verify the section renders without error
    await expect(page.getByText('Gallery Tags')).toBeVisible()
  })
})
