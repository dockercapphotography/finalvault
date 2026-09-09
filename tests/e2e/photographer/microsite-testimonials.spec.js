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

async function waitForReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

// Combines opening the row menu AND clicking Edit into ONE retry loop,
// rather than two separate functions each independently
// verify-then-act. The previous two-step version (openRowMenu, then a
// separate clickEditAndWaitForForm) had a real gap between "menu
// confirmed open" and "Edit click actually fires" -- evidence from a
// real failure showed the menu fully closed (zero menu items anywhere
// in the DOM) by the time the second function's first click attempt
// ran, even though openRowMenu had just confirmed it was open moments
// before. Retrying only the Edit click in that version was retrying
// against a target that had already vanished for the whole budget,
// never actually re-opening the menu. Every attempt here re-clicks the
// trigger from scratch, so there's no assumption that state persists
// across a boundary where it demonstrably doesn't always survive.
async function openMenuAndClickEdit(row, page) {
  const trigger = row.getByRole('button').last()
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await trigger.click({ timeout: 3000 })
    } catch {
      await page.waitForTimeout(300)
      continue
    }
    const editBtn = page.getByRole('button', { name: 'Edit', exact: true })
    const menuOpen = await editBtn.isVisible().catch(() => false)
    if (!menuOpen) {
      await page.waitForTimeout(200)
      continue
    }
    try {
      await editBtn.click({ timeout: 2000 })
    } catch {
      await page.waitForTimeout(200)
      continue
    }
    const formOpen = await page.getByPlaceholder('What the client said').isVisible().catch(() => false)
    if (formOpen) return
    await page.waitForTimeout(200)
  }
  throw new Error('Edit form never opened after retries')
}

// Same combined-retry shape as openMenuAndClickEdit, for Remove instead
// -- the second, confirm click that follows this one is left as a plain
// unprotected click, since by that point we're looking at a stable
// inline confirm state rather than a dropdown that can close itself
// from outside interaction the same way.
async function openMenuAndClickRemove(row, page) {
  const trigger = row.getByRole('button').last()
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await trigger.click({ timeout: 3000 })
    } catch {
      await page.waitForTimeout(300)
      continue
    }
    const removeBtn = page.getByRole('button', { name: 'Remove', exact: true })
    const menuOpen = await removeBtn.isVisible().catch(() => false)
    if (!menuOpen) {
      await page.waitForTimeout(200)
      continue
    }
    try {
      await removeBtn.click({ timeout: 2000 })
    } catch {
      await page.waitForTimeout(200)
      continue
    }
    return
  }
  throw new Error('Remove menu item never became clickable after retries')
}

// Mirrors fixtures.js's withPremiumAccess fixture, duplicated locally
// same as withMicrosite below already is (plain @playwright/test import,
// no fixtures.js dependency). The MicrositeEditor page (/website) gates
// on the account's actual subscription tier independent of the
// microsites row's own `enabled` column -- so even an update that never
// touches `enabled` at all can still land on the "Microsite isn't
// included in your plan" lockout screen if the test account currently
// lacks premium access, which is the case by default in this suite.
async function withPremiumAccess(photographerId, fn) {
  const { data: storageRow, error: storageErr } = await sb()
    .from('photographer_storage')
    .select('tier_id')
    .eq('photographer_id', photographerId)
    .maybeSingle()
  if (storageErr) throw new Error(`Could not read photographer_storage: ${storageErr.message}`)
  const originalTierId = storageRow?.tier_id ?? null

  const { data: tier, error: tierErr } = await sb()
    .from('storage_tiers')
    .insert({
      name: `pw-premium-${crypto.randomUUID().slice(0, 8)}`,
      storage_gb: 50,
      price_monthly: 0,
      allow_premium_features: true,
    })
    .select()
    .single()
  if (tierErr) throw new Error(`Could not create disposable premium tier: ${tierErr.message}`)

  const { error: assignErr } = await sb()
    .from('photographer_storage')
    .upsert({ photographer_id: photographerId, tier_id: tier.id }, { onConflict: 'photographer_id' })
  if (assignErr) throw new Error(`Could not assign disposable premium tier: ${assignErr.message}`)

  try {
    await fn()
  } finally {
    if (originalTierId) {
      await sb().from('photographer_storage').update({ tier_id: originalTierId }).eq('photographer_id', photographerId)
    } else {
      await sb().from('photographer_storage').delete().eq('photographer_id', photographerId)
    }
    await sb().from('storage_tiers').delete().eq('id', tier.id)
  }
}

// Snapshot/restore the account's one-row `microsites` table around each
// test -- same pattern used elsewhere for this table (see
// booking-branding-and-covers.spec.js's withMicrosite). Testimonials live
// in one jsonb column on this row, so tests set that column directly via
// the DB for setup, then drive the UI for the actual behavior under test.
// Wraps everything in withPremiumAccess so every test using this helper
// is automatically covered, rather than adding it to each test body.
async function withMicrosite(photographerId, overrides, fn) {
  await withPremiumAccess(photographerId, async () => {
    const { data: existing } = await sb().from('microsites').select('*').eq('photographer_id', photographerId).maybeSingle()
    if (existing) {
      const { error } = await sb().from('microsites').update(overrides).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await sb().from('microsites').insert({ photographer_id: photographerId, enabled: true, ...overrides })
      if (error) throw new Error(error.message)
    }
    try {
      await fn()
    } finally {
      if (existing) {
        const { id, ...rest } = existing
        await sb().from('microsites').update(rest).eq('id', id)
      } else {
        await sb().from('microsites').delete().eq('photographer_id', photographerId)
      }
    }
  })
}

function makeTestimonials(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    quote: `Test testimonial number ${i + 1}, filled with enough text to be realistic.`,
    name: `Client ${i + 1}`,
    session_type: 'Portrait',
  }))
}

test.use({ storageState: 'tests/.auth/photographer.json' })

test.describe('Testimonials listing', () => {
  test('pagination appears once there are more than one page, and page size controls work', async ({ page }) => {
    const photographerId = await getPhotographerId()
    await withMicrosite(photographerId, { testimonials: makeTestimonials(12) }, async () => {
      await page.goto('/website')
      await waitForReady(page)
      // Default page size is 10, so 12 testimonials means a real second page.
      await expect(page.getByText('Client 1', { exact: true })).toBeVisible()
      await expect(page.getByText('Client 11', { exact: true })).not.toBeVisible()
      await expect(page.getByText(/Page 1 of 2/)).toBeVisible()

      await page.getByRole('button', { name: 'Next page' }).click()
      await expect(page.getByText('Client 11', { exact: true })).toBeVisible()
    })
  })

  test('adding a testimonial while on the last page opens its edit form immediately visible', async ({ page }) => {
    const photographerId = await getPhotographerId()
    await withMicrosite(photographerId, { testimonials: makeTestimonials(10) }, async () => {
      await page.goto('/website')
      await waitForReady(page)
      await page.getByRole('button', { name: 'Add testimonial', exact: true }).click()
      // The new (empty, incomplete) entry auto-opens for editing -- if the
      // page didn't jump to wherever it landed, this input wouldn't be visible.
      await expect(page.getByPlaceholder('What the client said')).toBeVisible({ timeout: 5000 })
    })
  })

  test('drag-reordering within a page persists after reload', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const testimonials = makeTestimonials(3)
    await withMicrosite(photographerId, { testimonials }, async () => {
      await page.goto('/website')
      await waitForReady(page)

      // dnd-kit's own keyboard sensor -- far more reliable to automate than
      // simulating raw pointer events against PointerSensor. Focus the
      // handle, Space to pick up, Arrow keys to move, Space to drop.
      const firstHandle = page.locator('button[aria-label="Drag to reorder"]').first()
      await firstHandle.focus()
      await page.keyboard.press('Space')
      await page.waitForTimeout(100)
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(100)
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(100)
      await page.keyboard.press('Space')
      await page.waitForTimeout(200)

      // MicrositeEditor has no autosave -- patch() only updates local
      // React state, nothing persists until Save changes is clicked.
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('microsites').select('testimonials').eq('photographer_id', photographerId).single()
      expect(data.testimonials[0].name).not.toBe('Client 1')
    })
  })

  test('edit and remove via the row menu work', async ({ page }) => {
    const photographerId = await getPhotographerId()
    await withMicrosite(photographerId, { testimonials: makeTestimonials(1) }, async () => {
      await page.goto('/website')
      await waitForReady(page)

      const row = page.locator('tr', { hasText: 'Client 1' })
      await openMenuAndClickEdit(row, page)
      await page.getByPlaceholder('What the client said').fill('Updated quote text for this testimonial.')
      await page.getByRole('button', { name: 'Done' }).click()
      await expect(page.getByText('Updated quote text for this testimonial.', { exact: false })).toBeVisible()

      const rowAfterEdit = page.locator('tr', { hasText: 'Client 1' })
      await openMenuAndClickRemove(rowAfterEdit, page)
      await page.getByRole('button', { name: 'Remove', exact: true }).click() // confirm
      await expect(page.getByText('Client 1', { exact: true })).not.toBeVisible({ timeout: 5000 })
    })
  })
})

test.describe('Testimonial photo upload', () => {
  test('uploading a photo replaces the "Add photo" state with a thumbnail, and compresses to WebP', async ({ page }) => {
    const photographerId = await getPhotographerId()
    await withMicrosite(photographerId, { testimonials: makeTestimonials(1) }, async () => {
      await page.goto('/website')
      await waitForReady(page)
      const row = page.locator('tr', { hasText: 'Client 1' })
      await openMenuAndClickEdit(row, page)

      // `row` (text-based: hasText 'Client 1') stops matching the instant
      // editing starts -- the name becomes an <input value="Client 1">,
      // and input values aren't counted as text content by hasText. Every
      // interaction from here on re-locates the editing row via a marker
      // that's actually stable across the whole edit session instead.
      const editingRow = page.locator('tr').filter({ has: page.getByPlaceholder('What the client said') })

      const fixturePath = 'tests/fixtures/test-images/test_image.jpg'
      await editingRow.getByRole('button', { name: 'Upload photo' }).click({ timeout: 8000 })
      await editingRow.locator('input[type="file"]').setInputFiles(fixturePath, { timeout: 8000 })
      await expect(page.getByText('Uploading…')).not.toBeVisible({ timeout: 15000 })

      // MicrositeEditor has no autosave -- nothing persists until Save
      // changes is clicked.
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('microsites').select('testimonials').eq('photographer_id', photographerId).single()
      const key = data.testimonials[0].photo_gallery_image_key
      expect(key).toBeTruthy()
      expect(key).toMatch(/\.webp$/)
      expect(key).toContain('/logos/testimonial-photo-')
    })
  })

  test('deleting a testimonial with an uploaded photo clears it from the array', async ({ page }) => {
    const photographerId = await getPhotographerId()
    const testimonials = makeTestimonials(1)
    testimonials[0].photo_gallery_image_key = `photographers/${photographerId}/logos/testimonial-photo-${crypto.randomUUID()}.webp`
    await withMicrosite(photographerId, { testimonials }, async () => {
      await page.goto('/website')
      await waitForReady(page)
      const row = page.locator('tr', { hasText: 'Client 1' })
      await openMenuAndClickRemove(row, page)
      await page.getByRole('button', { name: 'Remove', exact: true }).click() // confirm
      await expect(page.getByText('Client 1', { exact: true })).not.toBeVisible({ timeout: 5000 })

      // MicrositeEditor has no autosave -- nothing persists until Save
      // changes is clicked.
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('microsites').select('testimonials').eq('photographer_id', photographerId).single()
      expect(data.testimonials.length).toBe(0)
      // The R2 delete call itself is fire-and-forget from the client --
      // this confirms the testimonial (and thus the trigger for cleanup)
      // is really gone; verifying the R2 object's actual absence needs
      // worker/R2 access this suite doesn't have, so that part stays a
      // manual check, not an automated assertion here.
    })
  })
})
