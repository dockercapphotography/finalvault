path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/sessions.spec.js'
with open(path, 'r') as f:
    src = f.read()

old = '''  test('can delete a questionnaire template', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    // Scope to the questionnaire row containing this template name
    const qRow = page.locator('p.text-sm.font-medium').filter({ hasText: q.name }).locator('../..')
    await qRow.getByTitle('Delete').click()
    // DeleteConfirmRow renders a "Delete" confirm button below the row
    await page.getByRole('button', { name: /^Delete$/ }).last().click()
    await expect(page.getByText(q.name)).not.toBeVisible({ timeout: 5000 })
  })'''
new = '''  test('can delete a questionnaire template', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    // Scope to the questionnaire row containing this template name
    const qRow = page.locator('p.text-sm.font-medium').filter({ hasText: q.name }).locator('../..')
    await qRow.getByTitle('Delete').click()
    // DeleteConfirmRow appears below the row — scope confirm to the section containing q.name
    const confirmSection = page.locator('div').filter({ hasText: new RegExp(`Delete.*${q.name}`) }).last()
    await confirmSection.getByRole('button', { name: /^Delete$/ }).click()
    await expect(page.getByText(q.name)).not.toBeVisible({ timeout: 5000 })
  })'''
assert src.count(old) == 1, f"FAIL: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ Fixed delete confirm scoping")
