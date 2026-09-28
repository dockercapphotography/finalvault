import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Microsite structured pricing (v1.5.16): categories, Most popular, and
 * per-package booking links.
 *
 * Renderer tests seed the microsites row directly through the sb fixture
 * and load /website/preview -- same approach as
 * microsite-testimonials-render.spec.js, since they're about the PUBLIC
 * RENDERER, not the editor. /website/preview resolves
 * package_booking_tokens itself with the same rules as
 * get_site_by_hostname (sql/085): only active, non-archived signup pages.
 *
 * The Most popular test drives the editor's row menu, since the
 * one-per-category rule lives in the editor.
 *
 * testMicrosite snapshots/restores the one microsites row around each
 * test; signup pages created here are deleted in finally blocks.
 */

const run = Date.now()

async function seedPricing(sb, photographerId, fields) {
  const { error } = await sb.from('microsites').update({
    enabled: true,
    show_pricing: true,
    pricing_note: null,
    ...fields,
  }).eq('photographer_id', photographerId)
  if (error) throw new Error(error.message)
}

async function createSignupPage(sb, photographerId, overrides = {}) {
  const { data, error } = await sb.from('signup_pages').insert({
    photographer_id: photographerId,
    title: 'PW Pricing Booking Page',
    token: `pw-pricing-${crypto.randomUUID().slice(0, 8)}`,
    venue_address: '123 Test St, Columbus, OH',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// Same retry shape as microsite-testimonials.spec.js's menu helper -- the
// row menu can take a beat to become clickable after a re-render.
async function clickRowMenuItem(page, row, itemName) {
  const trigger = row.getByRole('button').last()
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await trigger.click({ timeout: 3000 }) } catch { await page.waitForTimeout(300); continue }
    const item = page.getByRole('button', { name: itemName, exact: true })
    if (!(await item.isVisible().catch(() => false))) { await page.waitForTimeout(200); continue }
    try { await item.click({ timeout: 2000 }) } catch { await page.waitForTimeout(200); continue }
    return
  }
  throw new Error(`Menu item "${itemName}" never became clickable after retries`)
}

test.describe('Microsite pricing — renderer', () => {
  test('packages saved before v1.5.16 render as a flat list, and incomplete ones are skipped', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    await seedPricing(sb, testMicrosite.photographerId, {
      section_variants: { pricing: 'list' },
      pricing_groups: [],
      packages: [
        { name: `PW Legacy A ${run}`, price: '$100', description: 'Old-style package' },
        { name: `PW Legacy B ${run}`, price: '$200' },
        { name: '', price: '', description: 'abandoned entry' },
      ],
    })

    await page.goto('/website/preview')
    await expect(page.getByText(`PW Legacy A ${run}`)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(`PW Legacy B ${run}`)).toBeVisible()
    await expect(page.locator('.ms-pricing-group-head')).toHaveCount(0)
    await expect(page.locator('.ms-pricing-row')).toHaveCount(2)
    await expect(page.getByText('abandoned entry')).toHaveCount(0)
  })

  test('categories render in order with their shared list, uncategorized first', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const gWeddings = crypto.randomUUID()
    const gCosplay = crypto.randomUUID()
    await seedPricing(sb, testMicrosite.photographerId, {
      section_variants: { pricing: 'cards' },
      pricing_groups: [
        { id: gCosplay, name: `PW Cosplay ${run}`, description: 'Epic cosplay deserves epic photos', includes: ['Posing help', ''] },
        { id: gWeddings, name: `PW Weddings ${run}`, description: '', includes: ['2nd photographer', 'First dances'] },
        { id: crypto.randomUUID(), name: 'PW Empty Category', description: '', includes: [] },
      ],
      packages: [
        { id: crypto.randomUUID(), name: `PW Loose ${run}`, price: '$50', group_id: null },
        { id: crypto.randomUUID(), name: `PW Micro ${run}`, price: '$500', group_id: gWeddings, price_label: 'Starting at', price_note: '+$30 per person', includes: ['10-30 guests'] },
        { id: crypto.randomUUID(), name: `PW Convention ${run}`, price: '$90', group_id: gCosplay },
      ],
    })

    await page.goto('/website/preview')
    await expect(page.getByText(`PW Loose ${run}`)).toBeVisible({ timeout: 10000 })

    // Empty categories are skipped; the rest keep pricing_groups order.
    await expect(page.locator('.ms-pricing-group-head h3')).toHaveText([`PW Cosplay ${run}`, `PW Weddings ${run}`])
    await expect(page.getByText('PW Empty Category')).toHaveCount(0)

    // Uncategorized block renders first, with no heading.
    const groups = page.locator('.ms-pricing-group')
    await expect(groups.nth(0)).toContainText(`PW Loose ${run}`)
    await expect(groups.nth(0).locator('.ms-pricing-group-head')).toHaveCount(0)
    await expect(groups.nth(1)).toContainText(`PW Convention ${run}`)
    await expect(groups.nth(2)).toContainText(`PW Micro ${run}`)

    // Shared list (blank lines dropped) and structured price fields.
    await expect(groups.nth(1)).toContainText('Every package includes: Posing help')
    await expect(groups.nth(2)).toContainText('Every package includes: 2nd photographer · First dances')
    const micro = page.locator('.ms-pricing-card', { hasText: `PW Micro ${run}` })
    await expect(micro.locator('.ms-price-label')).toHaveText('Starting at')
    await expect(micro.locator('.ms-price-note')).toHaveText('+$30 per person')
    await expect(micro.locator('.ms-pricing-includes li')).toHaveText(['10-30 guests'])
  })

  test('Featured layout: middle-card fallback only without categories; marked package wins', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const pkgs = [1, 2, 3].map(n => ({ id: crypto.randomUUID(), name: `PW Tier ${n} ${run}`, price: `$${n}00` }))

    // No categories, nothing marked -> original middle-card highlight.
    await seedPricing(sb, testMicrosite.photographerId, {
      section_variants: { pricing: 'featured' },
      pricing_groups: [],
      packages: pkgs,
    })
    await page.goto('/website/preview')
    await expect(page.locator('.ms-pricing-card--featured')).toHaveCount(1, { timeout: 10000 })
    await expect(page.locator('.ms-pricing-card--featured')).toContainText(`PW Tier 2 ${run}`)

    // With categories and nothing marked -> no highlight at all.
    const g = crypto.randomUUID()
    await seedPricing(sb, testMicrosite.photographerId, {
      pricing_groups: [{ id: g, name: `PW Group ${run}`, includes: [] }],
      packages: pkgs.map(p => ({ ...p, group_id: g })),
    })
    await page.reload()
    await expect(page.getByText(`PW Tier 1 ${run}`)).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.ms-pricing-card--featured')).toHaveCount(0)

    // Marked package is the highlighted one.
    await seedPricing(sb, testMicrosite.photographerId, {
      packages: pkgs.map((p, i) => ({ ...p, group_id: g, featured: i === 2 })),
    })
    await page.reload()
    await expect(page.locator('.ms-pricing-card--featured')).toHaveCount(1, { timeout: 10000 })
    await expect(page.locator('.ms-pricing-card--featured')).toContainText(`PW Tier 3 ${run}`)
  })

  test('Book buttons: live page and all-sessions link; inactive or archived pages hide the button', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const pid = testMicrosite.photographerId
    const { data: photographer, error } = await sb.from('photographers').select('all_sessions_token').eq('id', pid).single()
    if (error) throw new Error(error.message)

    const live = await createSignupPage(sb, pid)
    const inactive = await createSignupPage(sb, pid, { is_active: false })
    const archived = await createSignupPage(sb, pid, { archived_at: new Date().toISOString() })
    try {
      await seedPricing(sb, pid, {
        section_variants: { pricing: 'list' },
        pricing_groups: [],
        packages: [
          { id: crypto.randomUUID(), name: `PW Live ${run}`, price: '$1', booking_signup_page_id: live.id, booking_label: 'Reserve' },
          { id: crypto.randomUUID(), name: `PW Inactive ${run}`, price: '$2', booking_signup_page_id: inactive.id },
          { id: crypto.randomUUID(), name: `PW Archived ${run}`, price: '$3', booking_signup_page_id: archived.id },
          { id: crypto.randomUUID(), name: `PW All ${run}`, price: '$4', booking_all_sessions: true },
          { id: crypto.randomUUID(), name: `PW None ${run}`, price: '$5' },
        ],
      })

      await page.goto('/website/preview')
      const row = name => page.locator('.ms-pricing-row', { hasText: name })
      await expect(row(`PW Live ${run}`)).toBeVisible({ timeout: 10000 })

      const liveBtn = row(`PW Live ${run}`).locator('.ms-pricing-book')
      await expect(liveBtn).toHaveText('Reserve')
      await expect(liveBtn).toHaveAttribute('href', `/book/${live.token}`)

      if (photographer.all_sessions_token) {
        const allBtn = row(`PW All ${run}`).locator('.ms-pricing-book')
        await expect(allBtn).toHaveText('Book now')
        await expect(allBtn).toHaveAttribute('href', `/book/all/${photographer.all_sessions_token}`)
      }

      await expect(row(`PW Inactive ${run}`).locator('.ms-pricing-book')).toHaveCount(0)
      await expect(row(`PW Archived ${run}`).locator('.ms-pricing-book')).toHaveCount(0)
      await expect(row(`PW None ${run}`).locator('.ms-pricing-book')).toHaveCount(0)
    } finally {
      await sb.from('signup_pages').delete().in('id', [live.id, inactive.id, archived.id])
    }
  })
})

test.describe('Microsite pricing — editor', () => {
  test('Most popular is one per category and persists after save', async ({ page, testMicrosite, withPremiumAccess, sb }) => {
    const g = crypto.randomUUID()
    const a = { id: crypto.randomUUID(), name: `PW Pop A ${run}`, price: '$10', group_id: g, featured: false }
    const b = { id: crypto.randomUUID(), name: `PW Pop B ${run}`, price: '$20', group_id: g, featured: false }
    const loose = { id: crypto.randomUUID(), name: `PW Pop Loose ${run}`, price: '$30', group_id: null, featured: true }
    await seedPricing(sb, testMicrosite.photographerId, {
      pricing_groups: [{ id: g, name: `PW Pop Group ${run}`, includes: [] }],
      packages: [loose, a, b],
    })

    await page.goto('/website')
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible({ timeout: 10000 })

    const row = name => page.getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    await expect(row(a.name)).toBeVisible({ timeout: 10000 })

    await clickRowMenuItem(page, row(a.name), 'Mark as most popular')
    await clickRowMenuItem(page, row(b.name), 'Mark as most popular')

    const saveBtn = page.getByRole('button', { name: 'Save changes' })
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 10000 })

    const { data, error } = await sb.from('microsites').select('packages').eq('photographer_id', testMicrosite.photographerId).single()
    if (error) throw new Error(error.message)
    const byId = Object.fromEntries(data.packages.map(p => [p.id, p]))
    // Marking B cleared A (same category) but left the uncategorized one alone.
    expect(byId[a.id].featured).toBe(false)
    expect(byId[b.id].featured).toBe(true)
    expect(byId[loose.id].featured).toBe(true)
  })
})
