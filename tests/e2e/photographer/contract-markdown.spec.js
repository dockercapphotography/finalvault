import { photographerState, test, expect } from '../../fixtures/base.js'
import {
  sb, getPhotographerId, createInvoiceClient, createInvoiceSession, cleanupInvoices,
} from '../../fixtures/invoices.js'

/**
 * v1.6.1: a contract's Markdown (## headings, **bold**, *italic*, bullets,
 * numbered lines) shows as formatting -- not as symbols -- in Send
 * Contract's review step, on the contract page, and on the client's signing
 * page. The saved text is unchanged; only the display is formatted.
 */

test.use({ storageState: photographerState })

const BODY = [
  '## PW AGREEMENT',
  '',
  '**1. FEES**',
  '- Retainer: *non-refundable*',
  '4. Kept number',
  'WEDDING DAY',
  'Plain 5 * 3 text <b>not html</b>',
].join('\n')

async function expectFormatted(body) {
  await expect(body).toBeVisible({ timeout: 15000 })
  await expect(body).toContainText('PW AGREEMENT')
  await expect(body).not.toContainText('##')
  await expect(body).not.toContainText('**')
  await expect(body.locator('strong', { hasText: '1. FEES' })).toHaveCount(1)
  await expect(body.locator('em', { hasText: 'non-refundable' })).toHaveCount(1)
  // A typed number is kept as typed, not renumbered.
  await expect(body).toContainText('4.Kept number')
  // Plain text keeps its asterisks, and HTML in the text stays text.
  await expect(body).toContainText('Plain 5 * 3 text <b>not html</b>')
  await expect(body.locator('b')).toHaveCount(0)
}

async function createContract(clientId, sessionId) {
  const { data, error } = await sb().from('contracts').insert({
    photographer_id: await getPhotographerId(),
    client_id: clientId,
    session_id: sessionId ?? null,
    title: 'PW Markdown Contract',
    body: BODY,
    body_hash: 'abc123',
    status: 'sent',
    sign_token: crypto.randomUUID().replace(/-/g, ''),
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

test('the contract page and the client signing page show the formatting', async ({ page, browser }) => {
  const client = await createInvoiceClient()
  const contract = await createContract(client.id)
  const ctx = await browser.newContext()
  try {
    await page.goto(`/contracts/${contract.id}`)
    await expectFormatted(page.getByTestId('contract-body'))

    const clientPage = await ctx.newPage()
    await clientPage.goto(`/sign/${contract.sign_token}`)
    await expectFormatted(clientPage.getByTestId('sign-contract-body'))
  } finally {
    await ctx.close()
    await sb().from('contracts').delete().eq('id', contract.id)
    await cleanupInvoices({ clientIds: [client.id] })
  }
})

test('Send Contract review step shows the formatting', async ({ page }) => {
  const client = await createInvoiceClient()
  const session = await createInvoiceSession(client.id)
  const { data: template, error } = await sb().from('contract_templates').insert({
    photographer_id: await getPhotographerId(),
    name: `PW Markdown ${crypto.randomUUID().slice(0, 6)}`,
    body: BODY,
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  try {
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: 'Send Contract' }).click()
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).click()
    await page.getByRole('button', { name: /Continue/ }).click()
    await expectFormatted(page.getByTestId('contract-review-body'))
  } finally {
    await sb().from('contract_templates').delete().eq('id', template.id)
    await cleanupInvoices({ clientIds: [client.id], sessionIds: [session.id] })
  }
})
