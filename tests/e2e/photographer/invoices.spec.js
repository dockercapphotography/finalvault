import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  sb, createInvoiceClient, createInvoice, cleanupInvoices, isoDaysFromToday,
} from '../../fixtures/invoices.js'

/**
 * v1.6.0 invoicing, photographer side: the invoice editor (create, send
 * dialog, mark as sent, reminders, payments, PDF) and the Financials page
 * (summary, filters, payments export).
 *
 * No real email is sent: every test that clicks Send intercepts the
 * send-invoice Edge Function and checks what the page asked it to send.
 */

test.use({ storageState: photographerState })

async function waitForEditor(page) {
  await expect(page.getByTestId('invoice-title')).toBeVisible({ timeout: 15000 })
}

// Fakes a successful send and records the request body.
async function interceptSend(page) {
  const calls = []
  await page.route('**/functions/v1/send-invoice', async route => {
    calls.push(JSON.parse(route.request().postData() || '{}'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, emailId: 'test', portalLink: true }) })
  })
  return calls
}

test.describe('Invoice editor', () => {
  test('a custom line saves as a draft with the right total', async ({ page }) => {
    const client = await createInvoiceClient()
    try {
      await page.goto(`/invoices/new?client=${client.id}`)
      await waitForEditor(page)
      await page.getByTestId('add-item').click()
      await page.getByTestId('add-item-search').fill('PW Engagement Shoot')
      await page.getByTestId('catalog-custom').click()
      await page.getByTestId('line-price').last().fill('350')
      await expect(page.getByTestId('invoice-total')).toContainText('$350.00')
      await page.getByTestId('invoice-save').click()
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 })

      const { data: rows } = await sb().from('invoice_totals').select('status, total').eq('client_id', client.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('draft')
      expect(Number(rows[0].total)).toBe(350)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('Mark as sent without emailing sends nothing and marks it sent', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({ clientId: client.id, status: 'draft' })
    const calls = await interceptSend(page)
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await page.getByTestId('invoice-send').click()
      await expect(page.getByTestId('send-invoice-modal')).toBeVisible()
      await expect(page.getByTestId('send-invoice-to')).toHaveValue(client.email)
      await page.getByTestId('send-invoice-mark-sent').click()
      await expect(page.getByTestId('send-invoice-modal')).not.toBeVisible({ timeout: 10000 })

      const { data } = await sb().from('invoices').select('status, sent_at').eq('id', inv.id).single()
      expect(data.status).toBe('sent')
      expect(data.sent_at).not.toBeNull()
      expect(calls).toHaveLength(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('Send invoice saves it as sent and emails what the dialog shows', async ({ page }) => {
    const client = await createInvoiceClient({ first_name: 'Sendy' })
    const inv = await createInvoice({ clientId: client.id, status: 'draft', lines: [{ title: 'Mini Session', unit_price: 125 }] })
    const calls = await interceptSend(page)
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await page.getByTestId('invoice-send').click()
      await page.getByTestId('send-invoice-template').selectOption('built-in')
      await expect(page.getByTestId('send-invoice-subject')).toHaveValue(new RegExp(`Invoice #${inv.invoice_number}`))
      await expect(page.getByTestId('send-invoice-message')).toHaveValue(/Hi Sendy/)
      await page.getByTestId('send-invoice-to').fill('someone-else@example.com')
      await page.getByTestId('send-invoice-send').click()
      await expect(page.getByText('Invoice sent and emailed to someone-else@example.com')).toBeVisible({ timeout: 10000 })

      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ invoiceId: inv.id, kind: 'invoice', to: 'someone-else@example.com', attachPdf: true })
      expect(calls[0].message).toContain('$125.00')
      const { data } = await sb().from('invoices').select('status').eq('id', inv.id).single()
      expect(data.status).toBe('sent')
      // The client's saved email is untouched.
      const { data: c } = await sb().from('clients').select('email').eq('id', client.id).single()
      expect(c.email).toBe(client.email)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('Send reminder asks for the next installment; paid invoices have no reminder', async ({ page }) => {
    const client = await createInvoiceClient()
    const due = await createInvoice({
      clientId: client.id, lines: [{ title: 'Wedding', unit_price: 1000 }],
      schedule: [{ amount: 250, due_date: isoDaysFromToday(-3) }, { amount: 750, due_date: isoDaysFromToday(30) }],
    })
    const paid = await createInvoice({ clientId: client.id, lines: [{ title: 'Prints', unit_price: 40 }], payments: [{ amount: 40, paid_date: isoDaysFromToday(-1) }] })
    const calls = await interceptSend(page)
    try {
      await page.goto(`/invoices/${due.id}`)
      await waitForEditor(page)
      await page.getByTestId('invoice-remind').click()
      await page.getByTestId('send-invoice-template').selectOption('built-in')
      await expect(page.getByTestId('send-invoice-message')).toHaveValue(/\$250\.00/)
      await expect(page.getByTestId('send-invoice-mark-sent')).toHaveCount(0)
      await page.getByTestId('send-invoice-send').click()
      await expect(page.getByText(`Reminder sent to ${client.email}`)).toBeVisible({ timeout: 10000 })
      expect(calls[0]).toMatchObject({ invoiceId: due.id, kind: 'reminder', to: client.email })

      await page.goto(`/invoices/${paid.id}`)
      await waitForEditor(page)
      await expect(page.getByTestId('invoice-remind')).toHaveCount(0)
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('logging a payment locks the lines and updates the balance', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({
      clientId: client.id, lines: [{ title: 'Portrait', unit_price: 300 }],
      schedule: [{ amount: 100, due_date: isoDaysFromToday(0) }, { amount: 200, due_date: isoDaysFromToday(30) }],
    })
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await page.getByTestId('log-payment').click()
      await expect(page.getByTestId('log-payment-modal')).toBeVisible()
      // The first suggestion is the next installment.
      await expect(page.getByTestId('payment-amount')).toHaveValue('100.00')
      await page.getByTestId('log-payment-modal').getByRole('button', { name: 'Log payment' }).click()
      await expect(page.getByTestId('invoice-locked-banner')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('invoice-balance-amount')).toHaveText('$200.00')

      const { data } = await sb().from('invoice_totals').select('amount_paid, payment_status').eq('invoice_id', inv.id).single()
      expect(Number(data.amount_paid)).toBe(100)
      expect(data.payment_status).toBe('partial')
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })

  test('Download PDF returns a PDF named after the invoice', async ({ page }) => {
    const client = await createInvoiceClient()
    const inv = await createInvoice({ clientId: client.id })
    try {
      await page.goto(`/invoices/${inv.id}`)
      await waitForEditor(page)
      await page.getByTestId('invoice-menu').click()
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.getByTestId('invoice-pdf').click(),
      ])
      expect(download.suggestedFilename()).toBe(`invoice-${inv.invoice_number}.pdf`)
      const path = await download.path()
      const { readFileSync } = await import('fs')
      expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-')
    } finally {
      await cleanupInvoices({ clientIds: [client.id] })
    }
  })
})

test.describe('Financials', () => {
  test('summary filters and the payments export', async ({ page }) => {
    const tag = crypto.randomUUID().slice(0, 6)
    const overdueClient = await createInvoiceClient({ first_name: 'Overdue', last_name: `PW ${tag}` })
    const paidClient = await createInvoiceClient({ first_name: 'Paid', last_name: `PW ${tag}` })
    const draftClient = await createInvoiceClient({ first_name: 'Drafty', last_name: `PW ${tag}` })
    await createInvoice({ clientId: overdueClient.id, lines: [{ title: 'Late', unit_price: 120 }], dueDate: isoDaysFromToday(-10) })
    await createInvoice({ clientId: paidClient.id, lines: [{ title: 'Done', unit_price: 80 }], payments: [{ amount: 80, paid_date: isoDaysFromToday(0), method: 'venmo', note: '=cmd' }] })
    await createInvoice({ clientId: draftClient.id, status: 'draft', lines: [{ title: 'Later', unit_price: 60 }] })
    try {
      await page.goto('/financials')
      await expect(page.getByTestId('financials-summary')).toBeVisible({ timeout: 15000 })
      await page.getByRole('textbox', { name: /Search client/ }).fill(`PW ${tag}`)
      await expect(page.getByTestId('financials-invoice-row')).toHaveCount(3)

      await page.getByTestId('financials-overdue').click()
      await expect(page.getByTestId('financials-invoice-row')).toHaveCount(1)
      await expect(page.getByTestId('financials-invoice-row')).toContainText(`Overdue PW ${tag}`)
      await page.getByTestId('financials-overdue').click()

      await page.getByTestId('financials-drafts').click()
      await expect(page.getByTestId('financials-invoice-row')).toHaveCount(1)
      await expect(page.getByTestId('financials-invoice-row')).toContainText(`Drafty PW ${tag}`)
      await page.getByTestId('financials-drafts').click()

      await page.getByTestId('financials-collected').click()
      await expect(page.getByTestId('export-payments-modal')).toBeVisible()
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Download CSV/ }).click(),
      ])
      const { readFileSync } = await import('fs')
      const csv = readFileSync(await download.path(), 'utf8')
      expect(csv).toContain('Date paid,Client,Client email,Invoice #')
      expect(csv).toContain(`Paid PW ${tag}`)
      expect(csv).toContain('80.00,Venmo')
      // Formula guard: a note starting with "=" is neutralised.
      expect(csv).toContain("'=cmd")
    } finally {
      await cleanupInvoices({ clientIds: [overdueClient.id, paidClient.id, draftClient.id] })
    }
  })
})
