path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/crm.spec.js'
with open(path, 'r') as f:
    src = f.read()

# Fix search filter — use .first() and also clean up orphaned clients first
old = '''  test('search filters clients by name', async ({ page }) => {
    const client = await createTestClient({ first_name: 'Searchable', last_name: 'Person' })
    try {
      await page.goto('/clients')
      await page.locator('input[placeholder="Search clients..."]').first().fill('Searchable')
      await expect(page.getByText('Searchable').first()).toBeVisible()
    } finally {
      await deleteTestClient(client.id)
    }
  })'''
new = '''  test('search filters clients by name', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const client = await createTestClient({ first_name: `Search-${uid}`, last_name: 'Person' })
    try {
      await page.goto('/clients')
      // Use the visible search input (desktop = first visible one)
      const search = page.locator('input[placeholder="Search clients..."]').first()
      await search.waitFor({ state: 'visible' })
      await search.fill(`Search-${uid}`)
      await expect(page.getByText(`Search-${uid}`).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })'''
assert src.count(old) == 1, f"FAIL: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ Fixed search filter test — unique name per run, waits for visible input")
