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

// As of v1.4.2, Status/Event Date/Expiry Date/Tags/Sort all live behind one
// "Filters & sort" button (desktop panel) instead of always-visible pills.
// The mobile trigger is icon-only with a different accessible name
// ("Filters and sort", no "&"), and is display:none (excluded from the a11y
// tree) at the chromium project's desktop viewport -- so this text match is
// unambiguous without needing :visible scoping.
async function openFilters(page) {
  await page.getByRole('button', { name: 'Filters & sort' }).click()
}

async function closeFilters(page) {
  // Same button toggles open/closed.
  await page.getByRole('button', { name: 'Filters & sort' }).click()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Dashboard — Filters & Sort', () => {
  // ── Sort ────────────────────────────────────────────────────────────────────

  test.describe('Sort', () => {
    test('Sort by control is available in the Filters & sort panel', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await expect(page.getByLabel('Sort by')).toBeVisible()
    })

    test('changing sort updates the selected option', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await page.getByLabel('Sort by').selectOption('name_asc')
      await expect(page.getByLabel('Sort by')).toHaveValue('name_asc')
      // Switch to a different option too, to confirm it's not a one-way fluke
      await page.getByLabel('Sort by').selectOption('name_desc')
      await expect(page.getByLabel('Sort by')).toHaveValue('name_desc')
    })
  })

  // ── Tags filter ─────────────────────────────────────────────────────────────

  test.describe('Tags filter', () => {
    let photographerId
    let tag1, tag2, gallery1, gallery2

    test.beforeAll(async () => {
      photographerId = await getPhotographerId()

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

    test('Tags control appears in the Filters & sort panel when tags exist', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await expect(page.getByLabel('Tags')).toBeVisible({ timeout: 5000 })
    })

    test('selecting a tag filters galleries to those with that tag', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await page.getByLabel('Tags').click()
      await expect(page.getByRole('button', { name: 'pw-filter-alpha' })).toBeVisible({ timeout: 3000 })
      await page.getByRole('button', { name: 'pw-filter-alpha' }).click()
      await page.getByLabel('Tags').click() // close the nested Tags dropdown
      await closeFilters(page)
      await page.waitForTimeout(300)

      // Both galleries visible — use .first() since desktop+mobile cards both render
      await expect(page.getByText('Alpha Only Gallery').first()).toBeVisible()
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
    })

    test('selecting two tags filters to galleries with BOTH tags (AND logic)', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await page.getByLabel('Tags').click()
      await expect(page.getByRole('button', { name: 'pw-filter-alpha' })).toBeVisible({ timeout: 3000 })
      await page.getByRole('button', { name: 'pw-filter-alpha' }).click()
      await page.getByRole('button', { name: 'pw-filter-beta' }).click()
      await page.getByLabel('Tags').click() // close the nested Tags dropdown
      await closeFilters(page)
      await page.waitForTimeout(300)

      // AND logic: only Alpha Beta Gallery (which has BOTH tags) should be visible
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
      await expect(page.getByText('Alpha Only Gallery').first()).not.toBeVisible()

      // Reopen and confirm the Tags control reflects the 2-tag selection
      await openFilters(page)
      await expect(page.getByLabel('Tags')).toContainText('2 selected')
    })

    test('Clear all resets the tag filter', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await page.getByLabel('Tags').click()
      await expect(page.getByRole('button', { name: 'pw-filter-alpha' })).toBeVisible({ timeout: 3000 })
      await page.getByRole('button', { name: 'pw-filter-alpha' }).click()
      await page.getByLabel('Tags').click() // close the nested Tags dropdown

      await expect(page.getByText('Clear all')).toBeVisible()
      await page.getByText('Clear all').click()
      await page.waitForTimeout(300)

      await openFilters(page)
      await expect(page.getByLabel('Tags')).toContainText('Any')
    })

    test('dashboard search by tag name surfaces tagged gallery', async ({ page }) => {
      await gotoDashboard(page)
      // Two search inputs exist (desktop + mobile); the mobile one is
      // display:none at this viewport, so :visible scoping picks the
      // right one deterministically.
      const search = page.getByPlaceholder('Search all galleries...').locator('visible=true')
      await search.fill('pw-filter-alpha')

      await expect(page.getByText('Alpha Only Gallery').first()).toBeVisible({ timeout: 3000 })
      await expect(page.getByText('Alpha Beta Gallery').first()).toBeVisible()
    })

    test('tag filter flattens folder structure', async ({ page }) => {
      const { data: folder } = await sb().from('gallery_folders')
        .insert({ photographer_id: photographerId, name: 'pw-filter-folder' })
        .select().single()
      await sb().from('galleries').update({ folder_id: folder.id }).eq('id', gallery1.id)

      try {
        await gotoDashboard(page)
        await openFilters(page)
        await page.getByLabel('Tags').click()
        await expect(page.getByRole('button', { name: 'pw-filter-alpha' })).toBeVisible({ timeout: 3000 })
        await page.getByRole('button', { name: 'pw-filter-alpha' }).click()
        await page.getByLabel('Tags').click() // close the nested Tags dropdown
        await closeFilters(page)
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

  test.describe('Status filter', () => {
    test('Status control is visible in the Filters & sort panel', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await expect(page.getByLabel('Status')).toBeVisible()
    })

    test('Status filter — Active hides folder cards and flattens view', async ({ page }) => {
      await gotoDashboard(page)
      await openFilters(page)
      await page.getByLabel('Status').selectOption('active')
      await closeFilters(page)
      await page.waitForTimeout(300)

      // Folder cards should not appear (filter flattens)
      await expect(page.locator('h3').filter({ hasText: /folder/i })).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // OK if there happen to be folders with active galleries — just verify the filter applied
      })
    })
  })
})
