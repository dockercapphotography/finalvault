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
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function findEmailTemplateByName(name) {
  const photographerId = await getPhotographerId()
  const { data } = await sb().from('email_templates').select('*').eq('name', name).eq('photographer_id', photographerId).maybeSingle()
  return data
}

async function findContractTemplateByName(name) {
  const photographerId = await getPhotographerId()
  const { data } = await sb().from('contract_templates').select('*').eq('name', name).eq('photographer_id', photographerId).maybeSingle()
  return data
}

async function findGalleryTemplateByName(name) {
  const photographerId = await getPhotographerId()
  const { data } = await sb().from('gallery_templates').select('*').eq('name', name).eq('photographer_id', photographerId).maybeSingle()
  return data
}

async function deleteEmailTemplate(id) {
  await sb().from('email_templates').delete().eq('id', id)
}
async function deleteContractTemplate(id) {
  await sb().from('contract_templates').delete().eq('id', id)
}
async function deleteGalleryTemplate(id) {
  await sb().from('gallery_templates').delete().eq('id', id)
}

// ── Email Templates ─────────────────────────────────────────────────────────

test.describe('Email Templates — modal migration', () => {
  test('New Template opens a modal, list stays visible underneath', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New Template' }).first().click()
    await expect(page.getByRole('heading', { name: 'New Email Template' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Email Templates').first()).toBeVisible()
  })

  test('Cancel discards without creating anything', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Email Cancel Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New Template' }).first().click()
    await page.getByPlaceholder('e.g. Wedding Delivery').fill(name)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'New Email Template' })).not.toBeVisible({ timeout: 3000 })

    const created = await findEmailTemplateByName(name)
    expect(created).toBeNull()
  })

  test('Save creates the template with name, subject, and body', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Email Save Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New Template' }).first().click()
    await page.getByPlaceholder('e.g. Wedding Delivery').fill(name)
    await page.getByPlaceholder('Your photos are ready!').fill('Test subject line')
    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Email Template' })).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 })

    const created = await findEmailTemplateByName(name)
    try {
      expect(created).not.toBeNull()
      expect(created.subject).toBe('Test subject line')
    } finally {
      if (created) await deleteEmailTemplate(created.id)
    }
  })

  test('Duplicate creates a copy (new feature -- Email previously had no duplicate at all)', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Email Duplicate Test ${uid}`
    const { data: original, error } = await sb().from('email_templates').insert({
      photographer_id: await getPhotographerId(),
      name,
      subject: 'Original subject',
      body: 'Original body',
    }).select().single()
    if (error) throw new Error(error.message)

    try {
      await page.goto('/account?tab=templates')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 8000 })
      const row = page.locator('p.text-sm.font-medium').filter({ hasText: name }).locator('../..')
      await row.getByTitle('Duplicate').click()
      await expect(page.getByText(`${name} (Copy)`).first()).toBeVisible({ timeout: 5000 })

      const copy = await findEmailTemplateByName(`${name} (Copy)`)
      expect(copy).not.toBeNull()
      if (copy) await deleteEmailTemplate(copy.id)
    } finally {
      await deleteEmailTemplate(original.id)
    }
  })
})

// ── Contract Templates ──────────────────────────────────────────────────────

test.describe('Contract Templates — modal migration', () => {
  test('New Template opens a modal', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New Template' }).nth(1).click()
    await expect(page.getByRole('heading', { name: 'New Contract Template' })).toBeVisible({ timeout: 5000 })
  })

  test('Save creates the contract template', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Contract Save Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New Template' }).nth(1).click()
    await page.getByPlaceholder('e.g. Portrait Session Agreement').fill(name)
    await page.getByPlaceholder(/Enter your contract text/i).fill('This is the contract body.')
    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Contract Template' })).not.toBeVisible({ timeout: 5000 })

    const created = await findContractTemplateByName(name)
    try {
      expect(created).not.toBeNull()
    } finally {
      if (created) await deleteContractTemplate(created.id)
    }
  })
})

// ── Gallery Templates ────────────────────────────────────────────────────────
// Uses TemplateEditorModal's `children` escape hatch (theme swatches, grid
// controls, sets list, access toggles) rather than the generic `fields`
// prop the other two use -- this is the one migration that most needed a
// modal-rendering regression guard, since it's the most structurally
// different form of the three.

test.describe('Gallery Templates — modal migration', () => {
  test('New opens a modal with the custom form content (theme, grid, sets)', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New' }).first().click()
    await expect(page.getByRole('heading', { name: 'New Gallery Template' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Theme').first()).toBeVisible()
    await expect(page.getByText('Grid size').first()).toBeVisible()
    await expect(page.getByText('Default sets').first()).toBeVisible()
  })

  test('Save creates the gallery template with a set', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Gallery Save Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder('e.g. Wedding Delivery').fill(name)
    await page.getByPlaceholder('Set name').fill('Test Set')
    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Gallery Template' })).not.toBeVisible({ timeout: 5000 })

    const created = await findGalleryTemplateByName(name)
    try {
      expect(created).not.toBeNull()
      expect(created.sets).toContain('Test Set')
    } finally {
      if (created) await deleteGalleryTemplate(created.id)
    }
  })
})
