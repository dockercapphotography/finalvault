import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  createInvoiceClient, createInvoiceSession, createInvoice, cleanupInvoices, isoDaysFromToday,
} from '../../fixtures/invoices.js'

/**
 * v1.6.0: sessions read their money from invoices. Session Detail lists the
 * session's invoices (replacing the old Financials card), and the Sessions
 * board shows Paid / Partial / Overdue from them.
 */

test.use({ storageState: photographerState })

test('Session Detail lists every invoice on the session with where it stands', async ({ page }) => {
  const client = await createInvoiceClient()
  const session = await createInvoiceSession(client.id)
  await createInvoice({ clientId: client.id, sessionId: session.id, status: 'draft', lines: [{ title: 'PW Draft Add-on', unit_price: 60 }] })
  await createInvoice({
    clientId: client.id, sessionId: session.id,
    lines: [{ title: 'PW Session Fee', unit_price: 250 }, { title: 'PW Album', unit_price: 50 }],
    payments: [{ amount: 100, paid_date: isoDaysFromToday(-3) }],
  })
  await createInvoice({ clientId: client.id, sessionId: session.id, status: 'void', lines: [{ title: 'PW Voided', unit_price: 75 }] })
  try {
    await page.goto(`/sessions/${session.id}`)
    const rows = page.getByTestId('session-invoice-row')
    await expect(rows).toHaveCount(3, { timeout: 15000 })
    await expect(rows.nth(0)).toContainText('PW Draft Add-on')
    await expect(rows.nth(0)).toContainText('Draft')
    await expect(rows.nth(1)).toContainText('PW Session Fee')
    await expect(rows.nth(1)).toContainText('+1 more')
    await expect(rows.nth(1)).toContainText('Partial · $100.00 of $300.00')
    await expect(rows.nth(2)).toContainText('Void')

    // New invoice opens the editor with this client and session filled in.
    const newLink = page.getByTestId('session-new-invoice')
    await expect(newLink).toHaveAttribute('href', `/invoices/new?client=${client.id}&session=${session.id}`)
    await newLink.click()
    await expect(page.getByTestId('invoice-title')).toHaveText('New invoice', { timeout: 15000 })
    await expect(page.getByTestId('invoice-session')).toHaveValue(session.id)
    await expect(page.getByTestId('invoice-session').locator('option', { hasText: session.name })).toHaveCount(1)
  } finally {
    await cleanupInvoices({ clientIds: [client.id], sessionIds: [session.id] })
  }
})

test('the Sessions board shows Paid, Partial and Overdue from invoices', async ({ page }) => {
  const tag = crypto.randomUUID().slice(0, 6)
  const client = await createInvoiceClient()
  const paid = await createInvoiceSession(client.id, { name: `PW Board Paid ${tag}` })
  const partial = await createInvoiceSession(client.id, { name: `PW Board Partial ${tag}` })
  const overdue = await createInvoiceSession(client.id, { name: `PW Board Overdue ${tag}` })
  const unpaid = await createInvoiceSession(client.id, { name: `PW Board Unpaid ${tag}` })
  await createInvoice({ clientId: client.id, sessionId: paid.id, lines: [{ title: 'Fee', unit_price: 100 }], payments: [{ amount: 100, paid_date: isoDaysFromToday(-1) }] })
  await createInvoice({ clientId: client.id, sessionId: partial.id, lines: [{ title: 'Fee', unit_price: 100 }], payments: [{ amount: 40, paid_date: isoDaysFromToday(-1) }] })
  await createInvoice({ clientId: client.id, sessionId: overdue.id, lines: [{ title: 'Fee', unit_price: 100 }], dueDate: isoDaysFromToday(-7) })
  await createInvoice({ clientId: client.id, sessionId: unpaid.id, lines: [{ title: 'Fee', unit_price: 100 }], dueDate: isoDaysFromToday(20) })
  try {
    await page.goto('/sessions')
    await page.getByRole('button', { name: 'Board' }).first().click()
    await page.locator('input[placeholder="Search sessions or clients..."]').locator('visible=true').fill(tag)

    // A board card is the innermost rounded box holding the session's name.
    const card = name => page.locator('div.rounded-xl').filter({ hasText: name }).last()
    await expect(card(paid.name)).toBeVisible({ timeout: 15000 })
    await expect(card(paid.name)).toContainText('Paid')
    await expect(card(partial.name)).toContainText('Partial')
    await expect(card(overdue.name)).toContainText('Overdue')
    // Unpaid and not yet due: no badge.
    await expect(card(unpaid.name)).toBeVisible()
    await expect(card(unpaid.name)).not.toContainText(/Paid|Partial|Overdue/)
  } finally {
    await cleanupInvoices({ clientIds: [client.id], sessionIds: [paid.id, partial.id, overdue.id, unpaid.id] })
  }
})
