import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  sb, createInvoiceClient, createInvoice, cleanupInvoices, createCatalogItem, deleteCatalogItems, isoDaysFromToday,
} from '../../fixtures/invoices.js'

/**
 * v1.6.0 invoice editor, the parts invoices.spec.js doesn't cover: tax and
 * discount math and catalog lines, editing the payment schedule (and the
 * "doesn't add up" error), Overdue, deleting a payment, void + duplicate,
 * deleting a draft, and a standalone invoice started from Financials.
 */

test.use({ storageState: photographerState })

const tagOf = () => crypto.randomUUID().slice(0, 6)

async function waitForEditor(page) {
  await expect(page.getByTestId('invoice-title')).toBeVisible({ timeout: 15000 })
}

async function openMenuItem(page, testId) {
  await page.getByTestId('invoice-menu').click()
  await page.getByTestId(testId).click()
}

test.describe('Invoice editor — money', () => {
  test('tax applies to taxed lines after the discount, and catalog lines keep their link', async ({ page }) => {
    const item = await createCatalogItem({ name: `PW Taxed Session ${tagOf()}`, price: 100, taxable: true })
    const client = await createInvoiceClient()
    try {
      await page.goto(`/invoices/new?client=${client.id}`)
      await waitForEditor(page)

      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill(item.name)
      await page.getByTestId('catalog-option').filter({ hasText: item.name }).click()
      await expect(page.getByTestId('line-price').first()).toHaveValue('100.00')
      await expect(page.getByTestId('line-taxable').first()).toBeChecked()
      await expect(page.getByTestId('line-item').first()).toContainText('Catalog')

      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill('PW Untaxed Fee')
      await page.getByTestId('catalog-custom').click()
      await page.getByTestId('line-price').last().fill('50')
      await page.getByTestId('line-taxable').last().uncheck()

      await page.getByTestId('invoice-discount').fill('10')
      await page.getByTestId('invoice-tax').fill('8')
      // 150 - 15 discount + 8% of the taxed $100 after the discount ($90) = $142.20
      const totals = page.getByTestId('invoice-totals')
      await expect(totals).toContainText('$150.00')
      await expect(totals).toContainText('−$15.00')
      await expect(totals).toContainText('$7.20')
      await expect(page.getByTestId('invoice-total')).toHaveText('$142.20')

      await page.getByTestId('invoice-save').click()
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 })
      const { data: t } = await sb().from('invoice_totals').select('invoice_id, subtotal, discount_amount, tax_amount, total').eq('client_id', client.id).single()
      expect(Number(t.subtotal)).toBe(150)
      expect(Number(t.discount_amount)).toBe(15)
      expect(Number(t.tax_amount)).toBe(7.2)
      expect(Number(t.total)).toBe(142.2)
      const { data: lines } = await sb().from('invoice_line_items').select('title, catalog_item_id, taxable').eq('invoice_id', t.invoice_id).order('sort_order')
      expect(lines).toEqual([
        { title: item.name, catalog_item_id: item.id, taxable: true },
        { title: 'PW Untaxed Fee', catalog_item_id: null, taxable: false },
      ])
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
      await deleteCatalogItems([item.id])
    }
  })

  test('installments rebalance, save with their dates, and must add up to the total', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({ clientId: client.id, status: 'draft', lines: [{ title: 'PW Portrait', unit_price: 300 }] })
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await page.getByTestId('schedule-toggle').check()
      await expect(page.getByTestId('schedule-row')).toHaveCount(2)
      await expect(page.getByTestId('schedule-amount-1')).toHaveValue('150.00')

      // Changing the first installment rebalances the second.
      await page.getByTestId('schedule-amount-1').fill('100')
      await expect(page.getByTestId('schedule-amount-2')).toHaveValue('200.00')
      await page.getByTestId('schedule-due-1').fill(isoDaysFromToday(3))
      await page.getByTestId('schedule-due-2').fill(isoDaysFromToday(40))
      await expect(page.getByTestId('schedule-card')).toContainText('Adds up to $300.00')
      await page.getByTestId('invoice-save').click()
      await expect(page.getByText('Invoice saved')).toBeVisible({ timeout: 10000 })
      // The toast shows before the saved invoice reloads; edits made before
      // then are replaced. Save draft is disabled again once it has reloaded.
      await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled()

      const { data: rows } = await sb().from('invoice_payment_schedule').select('sequence, amount, due_date').eq('invoice_id', inv.id).order('sequence')
      expect(rows.map(r => [Number(r.amount), r.due_date])).toEqual([[100, isoDaysFromToday(3)], [200, isoDaysFromToday(40)]])

      // The whole total in the first leaves nothing for the second: blocked.
      await page.getByTestId('schedule-amount-1').fill('300')
      await expect(page.getByTestId('schedule-problem')).toHaveText('Installments add up to $500.00 but the total is $300.00.')
      await page.getByTestId('invoice-save').click()
      await expect(page.getByTestId('invoice-errors')).toContainText('The installments add up to $500.00, not the $300.00 total.')
      const { data: after } = await sb().from('invoice_payment_schedule').select('amount').eq('invoice_id', inv.id).order('sequence')
      expect(after.map(r => Number(r.amount))).toEqual([100, 200])
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('a sent invoice past its due date shows Overdue', async ({ page }) => {
    const client = await createInvoiceClient()
    const late = await createInvoice({ clientId: client.id, lines: [{ title: 'PW Late', unit_price: 90 }], dueDate: isoDaysFromToday(-5) })
    const onTime = await createInvoice({ clientId: client.id, lines: [{ title: 'PW On time', unit_price: 90 }], dueDate: isoDaysFromToday(5) })
    try {
      await page.goto(`/invoices/${late.id}`)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-payment-status').filter({ hasText: 'Overdue' })).toHaveCount(1)

      await page.goto(`/invoices/${onTime.id}`)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-payment-status').filter({ hasText: 'Unpaid' }).first()).toBeVisible()
      await expect(page.getByTestId('invoice-payment-status').filter({ hasText: 'Overdue' })).toHaveCount(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('deleting the only payment unlocks the invoice', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({
      clientId: client.id, lines: [{ title: 'PW Locked', unit_price: 200 }],
      payments: [{ amount: 50, paid_date: isoDaysFromToday(-1), method: 'cash' }],
    })
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-locked-banner')).toBeVisible()
      await expect(page.getByTestId('add-item')).toHaveCount(0)
      await expect(page.getByTestId('payment-row')).toContainText('$50.00 · Cash')

      await page.getByRole('button', { name: /^Delete payment from/ }).click()
      await expect(page.getByTestId('payment-row')).toContainText('The invoice will unlock.')
      await page.getByTestId('payment-row').getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Payment deleted')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('invoice-locked-banner')).toHaveCount(0)
      await expect(page.getByTestId('add-item')).toBeVisible()
      await expect(page.getByTestId('invoice-balance-amount')).toHaveText('$200.00')
      const { data } = await sb().from('invoice_payments').select('id').eq('invoice_id', inv.id)
      expect(data).toHaveLength(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })
})

test.describe('Invoice editor — lifecycle', () => {
  test('void keeps the invoice for records, and Duplicate reissues it as a new draft', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({
      clientId: client.id, notes: 'PW reissue notes',
      lines: [{ title: 'PW Original', unit_price: 120 }, { title: 'PW Extra', unit_price: 30 }],
      payments: [{ amount: 20, paid_date: isoDaysFromToday(-2) }],
    })
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await openMenuItem(page, 'invoice-void')
      await page.getByTestId('invoice-void-confirm').click()
      await expect(page.getByTestId('invoice-void-banner')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('invoice-status')).toHaveText('Void')
      await expect(page.getByTestId('log-payment')).toHaveCount(0)
      const { data: voided } = await sb().from('invoices').select('status, voided_at').eq('id', inv.id).single()
      expect(voided.status).toBe('void')
      expect(voided.voided_at).not.toBeNull()

      await openMenuItem(page, 'invoice-duplicate')
      await expect(page).not.toHaveURL(new RegExp(inv.id), { timeout: 15000 })
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-status')).toHaveText('Draft')
      await expect(page.getByTestId('invoice-total')).toHaveText('$150.00')
      await expect(page.getByTestId('payment-row')).toHaveCount(0)

      const copyId = page.url().split('/').pop()
      const { data: copy } = await sb().from('invoices')
        .select('status, client_id, notes, invoice_number, invoice_line_items(title), invoice_payments(id)').eq('id', copyId).single()
      expect(copy.status).toBe('draft')
      expect(copy.client_id).toBe(client.id)
      expect(copy.notes).toBe('PW reissue notes')
      expect(copy.invoice_number).toBeGreaterThan(inv.invoice_number)
      expect(copy.invoice_line_items.map(l => l.title).sort()).toEqual(['PW Extra', 'PW Original'])
      expect(copy.invoice_payments).toHaveLength(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('a draft can be deleted; a sent invoice can only be voided', async ({ page }) => {
    const client = await createInvoiceClient()
    const draft = await createInvoice({ clientId: client.id, status: 'draft' })
    const sent = await createInvoice({ clientId: client.id })
    try {
      await page.goto(`/invoices/${sent.id}`)
      await waitForEditor(page)
      await page.getByTestId('invoice-menu').click()
      await expect(page.getByTestId('invoice-void')).toBeVisible()
      await expect(page.getByTestId('invoice-delete')).toHaveCount(0)

      await page.goto(`/invoices/${draft.id}`)
      await waitForEditor(page)
      await openMenuItem(page, 'invoice-delete')
      await page.getByTestId('invoice-delete-confirm').click()
      // A standalone invoice goes back to its client.
      await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`), { timeout: 15000 })
      const { data } = await sb().from('invoices').select('id').eq('id', draft.id)
      expect(data).toHaveLength(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('New invoice from Financials makes a standalone invoice for the chosen client', async ({ page }) => {
    const tag = tagOf()
    const client = await createInvoiceClient({ first_name: 'Standalone', last_name: `PW ${tag}` })
    try {
      await page.goto('/financials')
      await page.getByRole('button', { name: 'New invoice' }).locator('visible=true').first().click()
      await expect(page).toHaveURL(/\/invoices\/new$/)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-session')).toBeDisabled()

      await page.getByText('Choose a client…').click()
      await page.getByPlaceholder('Search by name or email...').fill(`PW ${tag}`)
      await page.getByText(`Standalone PW ${tag}`).first().click()
      await expect(page.getByTestId('invoice-session')).toBeEnabled()
      await expect(page.getByTestId('invoice-session')).toHaveValue('')

      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill('PW Print Order')
      await page.getByTestId('catalog-custom').click()
      await page.getByTestId('line-price').last().fill('45')
      await page.getByTestId('invoice-save').click()
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 })

      const { data: inv } = await sb().from('invoices').select('status, session_id, invoice_line_items(title, unit_price)').eq('client_id', client.id).single()
      expect(inv.status).toBe('draft')
      expect(inv.session_id).toBeNull()
      expect(inv.invoice_line_items).toEqual([{ title: 'PW Print Order', unit_price: 45 }])
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })
})
