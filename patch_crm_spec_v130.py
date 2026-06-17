path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/crm.spec.js'
with open(path, 'r') as f:
    src = f.read()

# ── 1. Fix search input strict mode violation — two inputs now (desktop+mobile)
old = "    await expect(page.locator('input[placeholder=\"Search clients...\"]')).toBeVisible()"
new = "    await expect(page.locator('input[placeholder=\"Search clients...\"]').first()).toBeVisible()"
assert src.count(old) == 1, f"FAIL 1: {src.count(old)}"
src = src.replace(old, new)

# ── 2. Fix search filter test — same strict mode issue
old = "      await page.locator('input[placeholder=\"Search clients...\"]').fill('Searchable')"
new = "      await page.locator('input[placeholder=\"Search clients...\"]').first().fill('Searchable')"
assert src.count(old) == 1, f"FAIL 2: {src.count(old)}"
src = src.replace(old, new)

# ── 3. Remove Send Contract button test — moved to Sessions in v1.3.0
old = '''  test('shows Send Contract button', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('button', { name: /Send Contract/i }).first()).toBeVisible()
  })'''
new = '''  test('does not show Send Contract button (moved to Sessions in v1.3.0)', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByRole('button', { name: /Send Contract/i })).not.toBeVisible()
  })'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)}"
src = src.replace(old, new)

# ── 4. Remove Send Contract modal describe block — contracts now live under Sessions
old = '''// ── Send Contract Modal ───────────────────────────────────────────────────────

test.describe('Send Contract modal', () => {
  let client
  let template

  test.beforeEach(async () => {
    client = await createTestClient({
      first_name: 'Contract',
      last_name: `Client-${crypto.randomUUID().slice(0, 8)}`,
      email: `contract-${crypto.randomUUID().slice(0, 8)}@example.com`,
    })
    template = await createTestTemplate()
  })

  test.afterEach(async () => {
    await deleteTestClient(client.id)
    await deleteTestTemplate(template.id)
  })

  test('opens send contract modal', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Send Contract' })).toBeVisible()
  })

  test('shows template picker', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await expect(page.getByText('Contract template')).toBeVisible()
  })

  test('Continue button disabled without template selection', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await expect(page.getByRole('button', { name: /Continue/i })).toBeDisabled()
  })

  test('selects template and advances to preview', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).first().click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByText('Review Contract')).toBeVisible()
  })

  test('preview shows resolved client name', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).first().click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByText(`${client.first_name} ${client.last_name}`).first()).toBeVisible()
  })

  test('preview has Back button that returns to pick step', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).first().click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('Contract template')).toBeVisible()
  })

  test('preview Edit/Preview toggle works', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByRole('button', { name: /Send Contract/i }).first().click()
    await page.getByText('Select a template...').click()
    await page.getByText(template.name).first().click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await page.getByRole('button', { name: 'Edit' }).nth(1).click()
    await expect(page.locator('textarea').first()).toBeVisible()
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.locator('textarea').first()).not.toBeVisible()
  })
})'''
new = '''// ── Send Contract Modal ───────────────────────────────────────────────────────
// NOTE: Send Contract was moved from Client Detail to Sessions in v1.3.0.
// Contract tests now live in sessions.spec.js under Session Detail.'''
assert src.count(old) == 1, f"FAIL 4: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ crm.spec.js updated for v1.3.0:")
print("   - Search input uses .first() to avoid strict mode violation")
print("   - Send Contract button test updated (button removed from ClientDetail)")
print("   - Send Contract modal describe block removed (contracts live under Sessions)")
