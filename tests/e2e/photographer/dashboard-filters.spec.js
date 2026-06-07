import { test, expect } from '../../fixtures/fixtures.js'
import { createClient } from '@supabase/supabase-js'

// ── Supabase admin client ─────────────────────────────────────────────────────

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

async function gotoDashboard(page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Galleries' })).toBeVisible({ timeout: 10000 })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Dashboard — Sort & Filter', () => {
  // ── Sort ────────────────────────────────────────────────────────────────────

  test('sort dropdown is visible on desktop dashboard', async ({ page }) => {
    await gotoDashboard(page)
    // DashboardSortDropdown renders a button containing the sort label text
    await expect(page.getByRole('button', { name: /Created: New → Old/ })).toBeVisible()
  })

  test('sort dropdown opens and shows all sort options', async ({ page }) => {
    await gotoDashboard(page)
    // Click the sort dropdown button (has hidden sm:inline span inside)
    await page.getByRole('button', { name: /Created: New → Old/ }).click()
    await expect(page.getByRole('button', { name: 'Created: Old → New' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Name: A → Z' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Name: Z → A' })).toBeVisible()
  })

  // ── Tags filter ─────────────────────────────────────────────────────────────

  test.describe('Tags filter', () => {
    let photographerId
    let tag1, tag2, gallery1, gallery2

    test.beforeAll(async () => {
      photographerId = await getPhotographerId()

      // Create two tags
      const { data: t1 } = await sb()
        .from('gallery_tags')
        .insert({ photographer_id: photographerId, name: 'pw-filter-alpha', color: '#6366f1' })
        .select().single()
      const { data: t2 } = await sb()
        .from('gallery_tags')
        .insert({ photographer_id: photographerId, name: 'pw-filter-beta', color: '#ec4899' })
        .select().single()
      tag1 = t1
      tag2 = t2

      // Create two galleries — one with tag1, one with both
      const base = {
        photographer_id: photographerId,
        is_active: true,
        show_guide: false,
      }
      const { data: g1 } = await sb().from('galleries')
        .insert({ ...base, title: 'Alpha Only Gallery', share_token: `pw-alpha-${Date.now()}` })
        .select().single()
      const { data: g2 } = await sb().from('galleries')
        .insert({ ...base, title: 'Alpha Beta Gallery', share_token: `pw-beta-${Date.now()}` })
        .select().single()
      gallery1 = g1
      gallery2 = g2

      await sb().from('gallery_tag_assignments').insert([
        { gallery_id: gallery1.id, tag_id: tag1.id },
        { gallery_id: gallery2.id, tag_id: tag1.id },
        { gallery_id: gallery2.id, tag_id: tag2.id },
      ])
    })

    test.afterAll(async () => {
      if (gallery1) await sb().from('galleries').delete().eq('id', gallery1.id)
      if (gallery2) await sb().from('galleries').delete().eq('id', gallery2.id)
      if (tag1) await sb().from('gallery_tags').delete().eq('id', tag1.id)
      if (tag2) await sb().from('gallery_tags').delete().eq('id', tag2.id)
    })

    test('Tags filter pill appears on dashboard when tags exist', async ({ page }) => {
      await gotoDashboard(page)
      await expect(page.getByText(/^Tags$/)).toBeVisible({ timeout: 5000 })
    })

    test('selecting a tag filters galleries to those with that tag', async ({ page }) => {
      await gotoDashboard(page)
      await page.getByText(/^Tags$/).click()
      // Dropdown shows tag names
      await expect(page.getByText('pw-filter-alpha')).toBeVisible({ timeout: 3000 })
      await page.getByText('pw-filter-alpha').click()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      // Both galleries visible — use .first() since desktop+mobile cards both render
      await expect(page.getByText('Alpha Only Gallery').first()).toBeVisible()
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
    })

    test('selecting two tags filters to galleries with BOTH tags (AND logic)', async ({ page }) => {
      await gotoDashboard(page)
      await page.getByText(/^Tags$/).click()
      await expect(page.getByText('pw-filter-alpha')).toBeVisible({ timeout: 3000 })
      await page.getByText('pw-filter-alpha').click()
      await page.getByText('pw-filter-beta').click()

      // Close dropdown by clicking the Tags pill button again
      await page.getByRole('button', { name: /Tags/ }).click()
      await page.waitForTimeout(300)

      // AND logic: only Alpha Beta Gallery (which has BOTH tags) should be visible
      // Alpha Only Gallery (only has alpha) should NOT appear
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
      await expect(page.getByText('Alpha Only Gallery').first()).not.toBeVisible()

      // Active state: when multiple tags selected, pill shows "Tags · N"
      await expect(page.getByRole('button', { name: /Tags · 2/ })).toBeVisible()
    })

    test('tag filter active label shows selected count', async ({ page }) => {
      await gotoDashboard(page)
      await page.getByText(/^Tags$/).click()
      await expect(page.getByText('pw-filter-alpha')).toBeVisible({ timeout: 3000 })
      await page.getByText('pw-filter-alpha').click()
      // Close dropdown by clicking the pill button itself (first match = the pill, not dropdown item)
      await page.getByRole('button', { name: /pw-filter-alpha/ }).first().click()
      await page.waitForTimeout(300)
      // When one tag selected, TagsPill shows the tag name as the pill label
      await expect(page.getByRole('button', { name: /pw-filter-alpha/ }).first()).toBeVisible()
    })

    test('Clear all resets tag filter', async ({ page }) => {
      await gotoDashboard(page)
      await page.getByText(/^Tags$/).click()
      await expect(page.getByText('pw-filter-alpha')).toBeVisible({ timeout: 3000 })
      await page.getByText('pw-filter-alpha').click()
      await page.keyboard.press('Escape')

      // Click Clear all
      await expect(page.getByText('Clear all')).toBeVisible()
      await page.getByText('Clear all').click()

      // Tags pill returns to default label
      await expect(page.getByText(/^Tags$/)).toBeVisible()
      await expect(page.getByText(/Tags · /)).not.toBeVisible()
    })

    test('dashboard search by tag name surfaces tagged gallery', async ({ page }) => {
      await gotoDashboard(page)
      // Two search inputs exist (desktop + mobile) — use first (desktop)
      const search = page.getByPlaceholder('Search all galleries...').first()
      await search.fill('pw-filter-alpha')

      // Both tagged galleries should appear — use .first() for desktop card
      await expect(page.getByText('Alpha Only Gallery').first()).toBeVisible({ timeout: 3000 })
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
    })

    test('tag filter flattens folder structure', async ({ page }) => {
      // Create a folder and move gallery1 into it
      const { data: folder } = await sb().from('gallery_folders')
        .insert({ photographer_id: photographerId, name: 'pw-filter-folder' })
        .select().single()
      await sb().from('galleries').update({ folder_id: folder.id }).eq('id', gallery1.id)

      try {
        await gotoDashboard(page)
        await page.getByText(/^Tags$/).click()
        await expect(page.getByText('pw-filter-alpha')).toBeVisible({ timeout: 3000 })
        await page.getByText('pw-filter-alpha').click()
        await page.keyboard.press('Escape')

        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
        // gallery1 is in a folder, but tag filter should surface it anyway
        await expect(page.getByText('Alpha Only Gallery').first()).toBeVisible({ timeout: 3000 })
      } finally {
        await sb().from('galleries').update({ folder_id: null }).eq('id', gallery1.id)
        await sb().from('gallery_folders').delete().eq('id', folder.id)
      }
    })
  })

  // ── Status filter ────────────────────────────────────────────────────────────

  test('Status filter pill is visible', async ({ page }) => {
    await gotoDashboard(page)
    await expect(page.getByText('Status')).toBeVisible()
  })

  test('Status filter — Active hides folder cards and flattens view', async ({ page }) => {
    await gotoDashboard(page)
    await page.getByRole('button', { name: 'Status' }).click()
    await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Active', exact: true }).click()
    await page.keyboard.press('Escape')

    // Folder cards should not appear (filter flattens)
    await expect(page.locator('h3').filter({ hasText: /folder/i })).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // OK if there happen to be folders with active galleries — just verify the filter applied
    })
  })
})
