path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/sessions.spec.js'
with open(path, 'r') as f:
    src = f.read()

# ── 1. Fix duplicate ──────────────────────────────────────────────────────────
old = '''      await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
      // Duplicate button is an icon button with title="Duplicate" — click it in the questionnaire row
      const row = page.locator('div').filter({ hasText: q.name }).last()
      await row.getByTitle('Duplicate').click()'''
new = '''      await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
      await page.getByTitle('Duplicate').first().click()'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)}"
src = src.replace(old, new)

# ── 2. Fix delete ─────────────────────────────────────────────────────────────
old = '''    await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    const row = page.locator('div').filter({ hasText: q.name }).last()
    await row.getByTitle('Delete').click()'''
new = '''    await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    await page.getByTitle('Delete').first().click()'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)}"
src = src.replace(old, new)

# ── 3. Fix submission form test ───────────────────────────────────────────────
old = '''  test('submission form shows questionnaire name', async ({ page }) => {
    await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(questionnaire.name).first()).toBeVisible({ timeout: 10000 })
  })'''
new = '''  test('submission form shows session name as heading', async ({ page }) => {
    await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: session.name })).toBeVisible({ timeout: 10000 })
  })'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ All 3 patches applied")
