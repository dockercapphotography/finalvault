import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  sb, getPhotographerId, createInvoiceClient, createInvoiceSession, createInvoice, cleanupInvoices,
} from '../../fixtures/invoices.js'

/**
 * Contract template variables, checked in Send Contract's preview (nothing
 * is sent):
 *   - 44b572e: session date, start and end time from the session
 *   - v1.6.0 step 10: invoice variables from the invoice picked in the
 *     dialog, pre-selected when the session has exactly one invoice
 * And c71c067: inserting a variable keeps the template editor's textarea
 * scrolled where it was.
 */

test.use({ storageState: photographerState })

async function createTemplate(body) {
  const { data, error } = await sb().from('contract_templates').insert({
    photographer_id: await getPhotographerId(),
    name: `PW Vars ${crypto.randomUUID().slice(0, 6)}`,
    body,
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

test('Send Contract fills session and invoice variables in the preview', async ({ page }) => {
  const client = await createInvoiceClient()
  const session = await createInvoiceSession(client.id, { session_date: '2027-06-15', start_time: '14:00:00', end_time: '16:30:00' })
  const inv = await createInvoice({
    clientId: client.id, sessionId: session.id, lines: [{ title: 'Wedding', unit_price: 2500 }],
    schedule: [{ amount: 500, due_date: '2026-12-01' }, { amount: 2000, due_date: '2027-06-01' }],
  })
  const template = await createTemplate(
    'Date: {{session_date}}\nStart: {{session_start_time}}\nEnd: {{session_end_time}}\nTime: {{session_time}}\n' +
    'Invoice: {{invoice_number}}\nTotal: {{invoice_total}}\nRetainer: {{invoice_first_payment}}\n' +
    'Remaining: {{invoice_final_payment}} due {{invoice_final_due_date}}\nOwed: {{invoice_balance_due}}'
  )
  try {
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: 'Send Contract' }).click()
    await expect(page.getByTestId('contract-invoice-picker')).toHaveValue(inv.id)
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).click()
    await page.getByRole('button', { name: /Continue/ }).click()

    const preview = page.locator('pre')
    await expect(preview).toContainText('Date: June 15, 2027')
    await expect(preview).toContainText('Start: 2:00 PM')
    await expect(preview).toContainText('End: 4:30 PM')
    await expect(preview).toContainText('Time: 2:00 PM – 4:30 PM')
    await expect(preview).toContainText(`Invoice: #${inv.invoice_number}`)
    await expect(preview).toContainText('Total: $2,500.00')
    await expect(preview).toContainText('Retainer: $500.00')
    await expect(preview).toContainText('Remaining: $2,000.00 due June 1, 2027')
    await expect(preview).toContainText('Owed: $2,500.00')
    await expect(page.getByText("Some variables couldn't be filled in")).toHaveCount(0)
  } finally {
    await sb().from('contract_templates').delete().eq('id', template.id)
    await cleanupInvoices({ clientIds: [client.id], sessionIds: [session.id] })
  }
})

test('inserting a variable keeps the contract body scrolled in place', async ({ page }) => {
  await page.goto('/account?tab=templates')
  const section = page.locator('div.rounded-xl').filter({ has: page.getByRole('heading', { name: 'Contract Templates' }) })
  await section.getByRole('button', { name: 'New Template' }).first().click()

  const body = page.locator('textarea').first()
  const longText = Array.from({ length: 120 }, (_, i) => `Clause ${i + 1}: the parties agree to item ${i + 1}.`).join('\n')
  await body.fill(longText)

  // Caret in the middle, view scrolled to it.
  const before = await body.evaluate(el => {
    const pos = el.value.indexOf('Clause 60:')
    el.focus()
    el.setSelectionRange(pos, pos)
    el.scrollTop = el.scrollHeight / 2 - el.clientHeight / 2
    el.dispatchEvent(new Event('select', { bubbles: true }))
    return el.scrollTop
  })
  expect(before).toBeGreaterThan(100)

  await page.getByRole('button', { name: '{{client_name}}' }).click()

  const after = await body.evaluate(el => ({ scrollTop: el.scrollTop, inserted: el.value.includes('{{client_name}}Clause 60:') }))
  expect(after.inserted).toBe(true)
  expect(Math.abs(after.scrollTop - before)).toBeLessThan(40)

  await page.getByRole('button', { name: 'Cancel' }).last().click()
})
