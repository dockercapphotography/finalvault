import { photographerState, test, expect } from '../../fixtures/base.js'
import { createInvoiceClient, createInvoice, cleanupInvoices } from '../../fixtures/invoices.js'

/**
 * v1.6.0: the Client Portal's invoice PDF download, with and without a
 * portal password. The invoice-pdf Edge Function checks the portal token
 * (and the password, when one is set) itself, so a password-protected
 * portal must pass the password it was unlocked with.
 *
 * The photographer is the default page (to set a real portal password
 * through the app); each client visit gets its own anonymous context.
 */

test.use({ storageState: photographerState })

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

async function expectPdfDownload(page, invoiceNumber) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByTestId('portal-invoice-pdf').click(),
  ])
  expect(download.suggestedFilename()).toBe(`invoice-${invoiceNumber}.pdf`)
  const { readFileSync } = await import('fs')
  expect(readFileSync(await download.path()).subarray(0, 5).toString()).toBe('%PDF-')
}

test('a client downloads an invoice PDF from the portal', async ({ browser }) => {
  const client = await createInvoiceClient()
  const inv = await createInvoice({ clientId: client.id, lines: [{ title: 'PW Portal PDF', unit_price: 150 }] })
  const ctx = await browser.newContext()
  try {
    const clientPage = await ctx.newPage()
    await clientPage.goto(`/client/${client.portal_token}/invoices/${inv.id}`)
    await waitForPortalReady(clientPage)
    await expect(clientPage.getByTestId('portal-invoice-detail')).toBeVisible()
    await expectPdfDownload(clientPage, inv.invoice_number)
  } finally {
    await ctx.close()
    await cleanupInvoices({ clientIds: [client.id] })
  }
})

test('a password-protected portal shows invoices and the PDF only after unlocking', async ({ page, browser }) => {
  const client = await createInvoiceClient()
  const inv = await createInvoice({ clientId: client.id, lines: [{ title: 'PW Protected Invoice', unit_price: 220 }] })
  const ctx = await browser.newContext()
  try {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('button', { name: 'Add password' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Add password' }).click()
    await page.getByPlaceholder('Enter password').fill('invoicehorse1')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Portal password added')).toBeVisible()

    const clientPage = await ctx.newPage()
    await clientPage.goto(`/client/${client.portal_token}/invoices`)
    await waitForPortalReady(clientPage)
    await expect(clientPage.getByText('Password required')).toBeVisible()
    await expect(clientPage.getByText('PW Protected Invoice')).toHaveCount(0)

    await clientPage.getByPlaceholder('Password').fill('invoicehorse1')
    await clientPage.getByRole('button', { name: 'Continue' }).click()
    await expect(clientPage.getByTestId('portal-invoice-due')).toContainText('PW Protected Invoice', { timeout: 10000 })

    await clientPage.goto(`/client/${client.portal_token}/invoices/${inv.id}`)
    await waitForPortalReady(clientPage)
    await expect(clientPage.getByText('Password required')).not.toBeVisible()
    await expectPdfDownload(clientPage, inv.invoice_number)
  } finally {
    await ctx.close()
    await cleanupInvoices({ clientIds: [client.id] })
  }
})
