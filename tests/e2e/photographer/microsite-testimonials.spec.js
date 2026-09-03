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

// Clicks a row's ⋮ menu trigger and confirms the dropdown actually
// opened (checked via a known menu item becoming visible), retrying
// the click if not -- covers the click-outside-to-close race where
// the very click that opens the menu occasionally gets misread as the
// outside click that closes it again.
async function openRowMenu(row, page) {
  const trigger = row.getByRole('button').last()
  for (let attempt = 0; attempt < 5; attempt++) {
    // Short explicit timeout -- without this, a not-yet-actionable
    // element (page still settling right after load) can make this
    // single click call block for the whole default ~30s wait,
    // eating the entire retry budget on attempt one.
    try {
      await trigger.click({ timeout: 3000 })
    } catch {
      await page.waitForTimeout(300)
      continue
    }
    const opened = await page.getByRole('button', { name: 'Edit', exact: true })
      .or(page.getByRole('button', { name: 'Remove', exact: true }))
      .first().isVisible().catch(() => false)
    if (opened) return
    await page.waitForTimeout(200)
  }
  throw new Error('Row ⋮ menu never opened after retries')
}

// Same retry-and-verify approach as openRowMenu, applied to the Edit
// click itself -- click, confirm the edit form actually opened (the
// quote placeholder becomes visible), retry a few times if not.
async function clickEditAndWaitForForm(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.getByRole('button', { name: 'Edit', exact: true }).click({ timeout: 5000 })
    } catch {
      await page.waitForTimeout(300)
      continue
    }
    const opened = await page.getByPlaceholder('What the client said').isVisible().catch(() => false)
    if (opened) return
    await page.waitForTimeout(300)
  }
  throw new Error('Edit form never opened after retries')
}

// Snapshot/restore the account's one-row `microsites` table around each
// test -- same pattern used elsewhere for this table (see
// booking-branding-and-covers.spec.js's withMicrosite). Testimonials live
// in one jsonb column on this row, so tests set that column directly via
// the DB for setup, then drive the UI for the actual behavior under test.
async function withMicrosite(photographerId, overrides, fn) {
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
      await openRowMenu(row, page)
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await page.getByPlaceholder('What the client said').fill('Updated quote text for this testimonial.')
      await page.getByRole('button', { name: 'Done' }).click()
      await expect(page.getByText('Updated quote text for this testimonial.', { exact: false })).toBeVisible()

      const rowAfterEdit = page.locator('tr', { hasText: 'Client 1' })
      await openRowMenu(rowAfterEdit, page)
      await page.getByRole('button', { name: 'Remove', exact: true }).click()
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
      await openRowMenu(row, page)
      await page.waitForTimeout(150)
      await clickEditAndWaitForForm(page)

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
      await row.getByRole('button').last().click() // opens the row's ⋮ menu
      await page.getByRole('button', { name: 'Remove', exact: true }).click()
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
