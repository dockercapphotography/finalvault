import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  sb, getPhotographerId, createInvoiceClient, createInvoiceSession, createInvoice, cleanupInvoices,
  createCatalogItem, createInvoiceTemplate, deleteCatalogItems, deleteInvoiceTemplates, isoDaysFromToday,
} from '../../fixtures/invoices.js'

/**
 * v1.6.0 invoicing setup screens: the Invoice Catalog and Invoice Templates
 * in Account -> Invoicing, applying a template on an invoice, and starting
 * a new session's invoice from a template in the New Session wizard.
 */

test.use({ storageState: photographerState })

const tagOf = () => crypto.randomUUID().slice(0, 6)

async function openInvoicingTab(page) {
  await page.goto('/account?tab=payment')
  await expect(page.getByTestId('catalog-new-item')).toBeVisible({ timeout: 15000 })
}

// The catalog dialog's Default price field (its label isn't tied to the input).
const priceInput = page => page.locator('label', { hasText: 'Default price' }).locator('xpath=following-sibling::input')
const catalogRow = (page, name) => page.locator(`[data-testid="catalog-item"][data-name="${name}"]`)
const templateRow = (page, name) => page.locator(`[data-testid="template-row"][data-name="${name}"]`)

test.describe('Invoice catalog', () => {
  test('create, edit and delete an unused item', async ({ page }) => {
    const name = `PW Catalog ${tagOf()}`
    try {
      await openInvoicingTab(page)
      await page.getByTestId('catalog-new-item').click()
      await page.getByPlaceholder('e.g. Engagement Session').fill(name)
      await priceInput(page).fill('125')
      await page.getByPlaceholder('e.g. mi, hr').fill('hr')
      await page.getByText('Taxable by default').click()
      await page.getByRole('button', { name: 'Save Item' }).click()

      const row = catalogRow(page, name)
      await expect(row).toBeVisible({ timeout: 10000 })
      await expect(row).toContainText('Non-taxable')
      const { data: saved } = await sb().from('invoice_catalog_items')
        .select('id, default_unit_price, unit_label, taxable_default, active').eq('name', name).single()
      expect(Number(saved.default_unit_price)).toBe(125)
      expect(saved.unit_label).toBe('hr')
      expect(saved.taxable_default).toBe(false)
      expect(saved.active).toBe(true)

      await page.getByRole('button', { name: `Edit ${name}` }).click()
      await priceInput(page).fill('150')
      await page.getByRole('button', { name: 'Save Item' }).click()
      await expect.poll(async () => {
        const { data } = await sb().from('invoice_catalog_items').select('default_unit_price').eq('id', saved.id).single()
        return Number(data.default_unit_price)
      }, { timeout: 10000 }).toBe(150)

      // Never used on an invoice, so it can be deleted outright.
      await page.getByRole('button', { name: `Delete ${name}` }).click()
      await row.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(row).toHaveCount(0, { timeout: 10000 })
      const { data: gone } = await sb().from('invoice_catalog_items').select('id').eq('id', saved.id)
      expect(gone).toHaveLength(0)
    } finally {
      await sb().from('invoice_catalog_items').delete().eq('name', name)
    }
  })

  test('an item on an invoice is archived, not deleted, and leaves the Add item list', async ({ page }) => {
    const item = await createCatalogItem({ name: `PW Archivable ${tagOf()}`, price: 80 })
    const client = await createInvoiceClient()
    await createInvoice({ clientId: client.id, status: 'draft', lines: [{ title: item.name, unit_price: 80, catalog_item_id: item.id }] })
    try {
      await openInvoicingTab(page)
      const row = catalogRow(page, item.name)
      await expect(row).toBeVisible()
      await expect(page.getByRole('button', { name: `Delete ${item.name}` })).toHaveCount(0)
      await page.getByRole('button', { name: `Archive ${item.name}` }).click()

      // Archived items are hidden until "Show archived".
      await expect(row).toHaveCount(0, { timeout: 10000 })
      await page.getByTestId('catalog-toggle-archived').click()
      await expect(row).toContainText('Archived')
      const { data } = await sb().from('invoice_catalog_items').select('active').eq('id', item.id).single()
      expect(data.active).toBe(false)

      // A new invoice can't pick it any more.
      await page.goto(`/invoices/new?client=${client.id}`)
      await expect(page.getByTestId('invoice-title')).toBeVisible({ timeout: 15000 })
      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill(item.name)
      await expect(page.getByTestId('catalog-option')).toHaveCount(0)
      await expect(page.getByTestId('catalog-custom')).toBeVisible()
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
      await deleteCatalogItems([item.id])
    }
  })
})

test.describe('Invoice templates', () => {
  test('a template saved with a catalog line keeps following the catalog price', async ({ page }) => {
    const tag = tagOf()
    const item = await createCatalogItem({ name: `PW Template Session ${tag}`, price: 200, taxable: false })
    const name = `PW Package ${tag}`
    try {
      await openInvoicingTab(page)
      await page.getByTestId('template-new').click()
      await page.getByPlaceholder('e.g. Full Wedding').fill(name)

      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill(item.name)
      await page.getByTestId('catalog-option').filter({ hasText: item.name }).click()
      await expect(page.getByTestId('line-price-follows')).toBeVisible()

      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill(`PW Album ${tag}`)
      await page.getByTestId('catalog-custom').click()
      await page.getByTestId('line-price').last().fill('100')
      await expect(page.getByTestId('invoice-total')).toHaveText('$300.00')

      await page.getByTestId('template-schedule-toggle').check()
      await expect(page.getByTestId('template-schedule-sum')).toHaveText('Adds up to 100%')
      await page.getByRole('button', { name: 'Save Template' }).click()

      const row = templateRow(page, name)
      await expect(row).toBeVisible({ timeout: 10000 })
      await expect(row).toContainText('$300.00')
      await expect(row).toContainText('50% now · 50% 14 days before the session')

      const { data: t } = await sb().from('invoice_templates')
        .select('id, invoice_template_items(catalog_item_id, title, unit_price, sort_order), invoice_template_schedule(sequence, percent, due_rule, due_days)')
        .eq('name', name).single()
      const items = [...t.invoice_template_items].sort((a, b) => a.sort_order - b.sort_order)
      // The catalog line stores nothing of its own, so it follows the catalog.
      expect(items[0]).toMatchObject({ catalog_item_id: item.id, title: null, unit_price: null })
      expect(items[1]).toMatchObject({ catalog_item_id: null, title: `PW Album ${tag}` })
      expect(Number(items[1].unit_price)).toBe(100)
      const schedule = [...t.invoice_template_schedule].sort((a, b) => a.sequence - b.sequence)
      expect(schedule.map(r => [Number(r.percent), r.due_rule, r.due_days])).toEqual([[50, 'on_create', 0], [50, 'before_session', 14]])

      // Raise the catalog price: the template's total follows.
      await sb().from('invoice_catalog_items').update({ default_unit_price: 250 }).eq('id', item.id)
      await openInvoicingTab(page)
      await expect(templateRow(page, name)).toContainText('$350.00')
    } finally {
      await sb().from('invoice_templates').delete().eq('name', name)
      await deleteCatalogItems([item.id])
    }
  })

  test('Apply template adds its lines and dates its schedule from the session', async ({ page }) => {
    const tag = tagOf()
    const sessionDate = isoDaysFromToday(60)
    const template = await createInvoiceTemplate({
      name: `PW Apply ${tag}`, notes: 'PW template notes',
      items: [{ title: 'PW Day Rate', unit_price: 400 }, { title: 'PW Prints', unit_price: 50, quantity: 2 }],
      schedule: [{ percent: 25, due_rule: 'on_create' }, { percent: 75, due_rule: 'before_session', due_days: 7 }],
    })
    const client = await createInvoiceClient()
    const session = await createInvoiceSession(client.id, { session_date: sessionDate })
    try {
      await page.goto(`/invoices/new?client=${client.id}&session=${session.id}`)
      await expect(page.getByTestId('invoice-title')).toBeVisible({ timeout: 15000 })
      // The session's date is needed for "7 days before the session".
      await expect(page.getByTestId('invoice-session').locator('option', { hasText: session.name })).toHaveCount(1)

      await page.getByTestId('apply-template').click()
      await page.getByTestId('apply-template-option').filter({ hasText: template.name }).click()
      await expect(page.getByTestId('line-item')).toHaveCount(2)
      await expect(page.getByTestId('invoice-total')).toHaveText('$500.00')
      await expect(page.getByTestId('invoice-notes')).toHaveValue('PW template notes')
      await expect(page.getByTestId('schedule-row')).toHaveCount(2)
      await expect(page.getByTestId('schedule-amount-1')).toHaveValue('125.00')
      await expect(page.getByTestId('schedule-amount-2')).toHaveValue('375.00')
      await expect(page.getByTestId('schedule-due-2')).toHaveValue(isoDaysFromToday(53))

      await page.getByTestId('invoice-save').click()
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 })
      const { data: inv } = await sb().from('invoices')
        .select('session_id, status, notes, invoice_line_items(title, quantity, unit_price), invoice_payment_schedule(sequence, amount, due_date)')
        .eq('client_id', client.id).single()
      expect(inv.session_id).toBe(session.id)
      expect(inv.status).toBe('draft')
      expect(inv.notes).toBe('PW template notes')
      expect(inv.invoice_line_items.map(l => l.title).sort()).toEqual(['PW Day Rate', 'PW Prints'])
      const schedule = [...inv.invoice_payment_schedule].sort((a, b) => a.sequence - b.sequence)
      expect(schedule.map(r => Number(r.amount))).toEqual([125, 375])
      expect(schedule[0].due_date).toBe(isoDaysFromToday(0))
      expect(schedule[1].due_date).toBe(isoDaysFromToday(53))
    } finally {
      await cleanupInvoices({ clientIds: [client.id], sessionIds: [session.id] })
      await deleteInvoiceTemplates([template.id])
    }
  })

  test('New Session wizard creates the invoice from a template', async ({ page }) => {
    const tag = tagOf()
    const sessionDate = isoDaysFromToday(45)
    const template = await createInvoiceTemplate({
      name: `PW Wizard ${tag}`,
      items: [{ title: 'PW Wizard Package', unit_price: 600 }],
      schedule: [{ percent: 50, due_rule: 'on_create' }, { percent: 50, due_rule: 'on_session' }],
    })
    const client = await createInvoiceClient({ first_name: 'Wizard', last_name: `Client ${tag}` })
    const sessionName = `PW Wizard Session ${tag}`
    try {
      await page.goto('/sessions')
      await page.getByRole('button', { name: /New Session/i }).first().click()
      await page.getByPlaceholder('e.g. Smith Family Portrait').fill(sessionName)
      await page.locator('label', { hasText: /^Date$/ }).locator('xpath=following-sibling::input').fill(sessionDate)
      await page.getByRole('button', { name: /Next/i }).click()

      await page.getByText('Link to a client...').first().click()
      await page.getByPlaceholder('Search by name or email...').fill(`Client ${tag}`)
      await page.getByText(`Wizard Client ${tag}`).first().click()
      await page.getByRole('button', { name: /Next/i }).click()

      await expect(page.getByTestId('session-invoice-step')).toBeVisible()
      await page.getByTestId('session-invoice-toggle').click({ force: true })
      await page.getByTestId('session-invoice-template').selectOption(template.id)
      await expect(page.getByTestId('line-item')).toHaveCount(1)
      await expect(page.getByTestId('session-invoice-pattern')).toContainText('50% now · 50% on the session date')
      await page.getByRole('button', { name: 'Create Session' }).click()
      await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/, { timeout: 15000 })

      const { data: session } = await sb().from('sessions').select('id').eq('name', sessionName)
        .eq('photographer_id', await getPhotographerId()).single()
      const { data: inv } = await sb().from('invoices')
        .select('status, client_id, invoice_line_items(title, unit_price), invoice_payment_schedule(sequence, amount, due_date)')
        .eq('session_id', session.id).single()
      expect(inv.status).toBe('draft')
      expect(inv.client_id).toBe(client.id)
      expect(inv.invoice_line_items).toEqual([{ title: 'PW Wizard Package', unit_price: 600 }])
      const schedule = [...inv.invoice_payment_schedule].sort((a, b) => a.sequence - b.sequence)
      expect(schedule.map(r => Number(r.amount))).toEqual([300, 300])
      expect(schedule[0].due_date).toBe(isoDaysFromToday(0))
      expect(schedule[1].due_date).toBe(sessionDate)

      // The session page lists it.
      await expect(page.getByTestId('session-invoice-row')).toHaveCount(1, { timeout: 10000 })
      await expect(page.getByTestId('session-invoice-row')).toContainText('PW Wizard Package')
    } finally {
      const { data: sessions } = await sb().from('sessions').select('id').eq('name', sessionName)
      await cleanupInvoices({ clientIds: [client.id], sessionIds: (sessions ?? []).map(s => s.id) })
      await deleteInvoiceTemplates([template.id])
    }
  })
})
