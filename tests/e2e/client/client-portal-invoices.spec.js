import { test, expect } from '../../fixtures/base.js'
import {
  createInvoiceClient, createInvoice, cleanupInvoices, setPaymentLinks, getPaymentLinks, isoDaysFromToday,
} from '../../fixtures/invoices.js'

/**
 * v1.6.0: invoices in the Client Portal (sql/115). Only sent invoices
 * reach the client; unpaid ones sit under "Needs payment" with a Pay
 * button built from the photographer's payment link.
 */

test.use({ contextOptions: { storageState: undefined } })

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

let savedLinks
test.beforeAll(async () => { savedLinks = await getPaymentLinks() })
test.afterAll(async () => { await setPaymentLinks(savedLinks?.payment_links ?? {}, savedLinks?.default_invoice_platform ?? null) })

test.describe('Client portal — invoices', () => {
  test('lists sent invoices only, grouped, with a Venmo Pay button for the amount due', async ({ page }) => {
    await setPaymentLinks({ venmo: 'https://venmo.com/pw-test-studio', zelle: 'pay@example.com' }, 'venmo')
    const client = await createInvoiceClient()
    const due = await createInvoice({
      clientId: client.id, lines: [{ title: 'PW Wedding', unit_price: 1000 }],
      schedule: [{ amount: 250, due_date: isoDaysFromToday(5) }, { amount: 750, due_date: isoDaysFromToday(60) }],
    })
    const paid = await createInvoice({ clientId: client.id, lines: [{ title: 'PW Prints', unit_price: 40 }], payments: [{ amount: 40, paid_date: isoDaysFromToday(-2) }] })
    const draft = await createInvoice({ clientId: client.id, status: 'draft', lines: [{ title: 'PW Hidden Draft', unit_price: 10 }] })
    const voided = await createInvoice({ clientId: client.id, status: 'void', lines: [{ title: 'PW Hidden Void', unit_price: 10 }] })
    try {
      await page.goto(`/client/${client.portal_token}/invoices`)
      await waitForPortalReady(page)

      const dueCard = page.getByTestId('portal-invoice-due')
      await expect(dueCard).toHaveCount(1)
      await expect(dueCard).toContainText('PW Wedding')
      await expect(dueCard).toContainText('$250.00 due')
      const pay = dueCard.getByTestId('portal-pay-link')
      await expect(pay).toHaveText(/Pay \$250\.00 with Venmo/)
      await expect(pay).toHaveAttribute('href', `https://venmo.com/pw-test-studio?txn=pay&amount=250.00&note=Invoice%20%23${due.invoice_number}`)

      await expect(page.getByTestId('portal-invoice-paid')).toHaveCount(1)
      await expect(page.getByTestId('portal-invoice-paid')).toContainText('PW Prints')
      await expect(page.getByText('PW Hidden Draft')).toHaveCount(0)
      await expect(page.getByText('PW Hidden Void')).toHaveCount(0)
      expect(paid.id && draft.id && voided.id).toBeTruthy()
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('Zelle shows the address to copy instead of a link', async ({ page }) => {
    await setPaymentLinks({ zelle: 'pay@example.com' }, 'zelle')
    const client = await createInvoiceClient()
    await createInvoice({ clientId: client.id, lines: [{ title: 'PW Mini', unit_price: 75 }] })
    try {
      await page.goto(`/client/${client.portal_token}/invoices`)
      await waitForPortalReady(page)
      await expect(page.getByTestId('portal-pay-text')).toContainText('Send $75.00 with Zelle to')
      await expect(page.getByTestId('portal-pay-text')).toContainText('pay@example.com')
      await expect(page.getByTestId('portal-pay-link')).toHaveCount(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('invoice page shows items, schedule and payments received', async ({ page }) => {
    await setPaymentLinks({}, null)
    const client = await createInvoiceClient()
    const inv = await createInvoice({
      clientId: client.id, taxRate: 8, discountRate: 10, notes: 'PW thanks note',
      lines: [{ title: 'PW Wedding', unit_price: 2200, taxable: true, description: '8 hours' }, { title: 'PW Travel', unit_price: 0.75, quantity: 100 }],
      schedule: [{ amount: 500, due_date: isoDaysFromToday(10) }, { amount: 1705.90, due_date: isoDaysFromToday(90) }],
      payments: [{ amount: 300, paid_date: isoDaysFromToday(-1), method: 'venmo', note: 'PRIVATE NOTE' }],
    })
    try {
      await page.goto(`/client/${client.portal_token}/invoices/${inv.id}`)
      await waitForPortalReady(page)
      await expect(page.getByTestId('portal-invoice-detail')).toBeVisible()
      await expect(page.getByTestId('portal-invoice-amount')).toHaveText('$200.00 due')
      const items = page.getByTestId('portal-invoice-items')
      await expect(items).toContainText('PW Wedding')
      await expect(items).toContainText('8 hours')
      await expect(items).toContainText('100 × $0.75')
      await expect(items).toContainText('$2,205.90')
      await expect(items).toContainText('$1,905.90')
      await expect(page.getByTestId('portal-invoice-schedule')).toContainText('Partly paid')
      await expect(page.getByTestId('portal-invoice-payments')).toContainText('$300.00')
      await expect(page.getByText('PW thanks note')).toBeVisible()
      // Payment notes are the photographer's own and never reach the client.
      await expect(page.getByText('PRIVATE NOTE')).toHaveCount(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })
})
