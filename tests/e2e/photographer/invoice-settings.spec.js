import { photographerState, test, expect } from '../../fixtures/base.js'
import { sb, getPhotographerId, createInvoiceClient, createInvoice, cleanupInvoices } from '../../fixtures/invoices.js'

/**
 * v1.6.0 invoice settings in Account: Invoice Email templates (the starred
 * default is what the Send dialog starts with) and the Logo on invoices
 * choice, including uploading a logo for light backgrounds.
 *
 * No email is sent: the Send dialog is only opened and checked.
 */

test.use({ storageState: photographerState })

test('a new Invoice Email template set as default fills the Send dialog', async ({ page }) => {
  const tag = crypto.randomUUID().slice(0, 6)
  const name = `PW Email ${tag}`
  const photographerId = await getPhotographerId()
  const { data: previous } = await sb().from('invoice_email_templates').select('id')
    .eq('photographer_id', photographerId).eq('kind', 'invoice').eq('is_default', true).maybeSingle()
  const client = await createInvoiceClient({ first_name: 'Templ' })
  const inv = await createInvoice({ clientId: client.id, status: 'draft' })
  try {
    await page.goto('/account?tab=templates')
    await page.getByTestId('invoice-email-new-invoice').click()
    await page.getByPlaceholder('e.g. Wedding invoice').fill(name)
    // A new template starts from the built-in subject; replace it.
    await page.getByPlaceholder('Invoice #{{invoice_number}} from {{studio_name}}', { exact: true })
      .fill(`PW {{client_first_name}} invoice #{{invoice_number}} ${tag}`)
    await page.getByRole('button', { name: 'Save Template' }).click()

    const row = page.locator('div.justify-between').filter({ hasText: name }).last()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByRole('button', { name: 'Set as default' }).click()
    await expect(row).toContainText('Default')

    const { data: saved } = await sb().from('invoice_email_templates').select('id, kind, is_default, body').eq('name', name).single()
    expect(saved.kind).toBe('invoice')
    expect(saved.is_default).toBe(true)
    expect(saved.body).toContain('{{client_first_name}}')

    await page.goto(`/invoices/${inv.id}`)
    await expect(page.getByTestId('invoice-title')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('invoice-send').click()
    await expect(page.getByTestId('send-invoice-template')).toHaveValue(saved.id)
    await expect(page.getByTestId('send-invoice-subject')).toHaveValue(`PW Templ invoice #${inv.invoice_number} ${tag}`)
  } finally {
    await sb().from('invoice_email_templates').delete().eq('name', name)
    if (previous) await sb().from('invoice_email_templates').update({ is_default: true }).eq('id', previous.id)
    await cleanupInvoices({ clientIds: [client.id] })
  }
})

test.describe('Logo on invoices', () => {
  let original
  test.beforeEach(async () => {
    const { data } = await sb().from('photographers').select('invoice_logo_r2_key, invoice_logo_mode').eq('id', await getPhotographerId()).single()
    original = data
  })
  test.afterEach(async () => {
    if (original) {
      await sb().from('photographers')
        .update({ invoice_logo_r2_key: original.invoice_logo_r2_key, invoice_logo_mode: original.invoice_logo_mode })
        .eq('id', await getPhotographerId())
    }
  })

  async function modeNow() {
    const { data } = await sb().from('photographers').select('invoice_logo_mode').eq('id', await getPhotographerId()).single()
    return data.invoice_logo_mode
  }

  test('choosing what shows on invoices saves to the account', async ({ page }) => {
    await page.goto('/account?tab=payment')
    await expect(page.getByTestId('invoice-logo-section')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('invoice-logo-none').click()
    await expect.poll(modeNow, { timeout: 10000 }).toBe('none')
    await page.getByTestId('invoice-logo-main').click()
    await expect.poll(modeNow, { timeout: 10000 }).toBe('main')
    // Controlled radio: it turns on once the choice has saved, so click (not check).
    await page.getByTestId('invoice-logo-light').getByRole('radio').click()
    await expect.poll(modeNow, { timeout: 10000 }).toBeNull()
    await expect(page.getByTestId('invoice-logo-light').getByRole('radio')).toBeChecked()
  })

  test('upload a logo for light backgrounds, then remove it', async ({ page }) => {
    // Uploading replaces (and deletes) an existing invoice logo; never touch a real one.
    test.skip(Boolean(original?.invoice_logo_r2_key), 'This account already has an invoice logo')
    const keyNow = async () => {
      const { data } = await sb().from('photographers').select('invoice_logo_r2_key').eq('id', await getPhotographerId()).single()
      return data.invoice_logo_r2_key
    }

    await page.goto('/account?tab=payment')
    const section = page.getByTestId('invoice-logo-section')
    await expect(section).toBeVisible({ timeout: 15000 })
    await section.locator('input[type="file"]').setInputFiles('tests/fixtures/test-images/test_image.jpg')

    // Stored as a PNG under the account's logos folder (served by the worker's /logo/ route).
    await expect.poll(keyNow, { timeout: 20000 }).toMatch(/\/logos\/invoice-logo-[0-9a-f-]+\.png$/)
    const preview = page.getByTestId('invoice-logo-light').locator('img')
    await expect(preview).toBeVisible()
    await expect.poll(() => preview.evaluate(img => img.complete && img.naturalWidth), { timeout: 15000 }).toBeGreaterThan(0)

    await section.getByRole('button', { name: 'Remove' }).click()
    await expect.poll(keyNow, { timeout: 10000 }).toBeNull()
    await expect(page.getByTestId('invoice-logo-upload')).toHaveText('Upload')
  })
})
