path = '/Users/nickporterfield/code/finalvault/tests/e2e/photographer/sessions.spec.js'
with open(path, 'r') as f:
    src = f.read()

# ── 1. Fix duplicate — scope to questionnaire section ────────────────────────
old = '''  test('can duplicate a questionnaire template', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    const copyName = `${q.name} (copy)`
    try {
      await page.goto('/account?tab=templates')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
      await page.getByTitle('Duplicate').first().click()
      await expect(page.getByText(copyName).first()).toBeVisible({ timeout: 5000 })

      const photographerId = await getPhotographerId()
      const { data } = await sb().from('questionnaire_templates').select('id').eq('name', copyName).eq('photographer_id', photographerId).single()
      if (data) await deleteTestQuestionnaireTemplate(data.id)
    } finally {
      await deleteTestQuestionnaireTemplate(q.id)
    }
  })'''
new = '''  test('can duplicate a questionnaire template', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    const copyName = `${q.name} (copy)`
    try {
      await page.goto('/account?tab=templates')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
      // Scope to the questionnaire row containing this template name
      const qRow = page.locator('p.text-sm.font-medium').filter({ hasText: q.name }).locator('../..')
      await qRow.getByTitle('Duplicate').click()
      await expect(page.getByText(copyName).first()).toBeVisible({ timeout: 5000 })

      const photographerId = await getPhotographerId()
      const { data } = await sb().from('questionnaire_templates').select('id').eq('name', copyName).eq('photographer_id', photographerId).single()
      if (data) await deleteTestQuestionnaireTemplate(data.id)
    } finally {
      await deleteTestQuestionnaireTemplate(q.id)
    }
  })'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)}"
src = src.replace(old, new)

# ── 2. Fix delete — scope to questionnaire row ────────────────────────────────
old = '''  test('can delete a questionnaire template', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    await page.getByTitle('Delete').first().click()
    // DeleteConfirmRow has a "Delete" confirm button
    await page.getByRole('button', { name: /^Delete$/ }).first().click()
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
    // DeleteConfirmRow renders a "Delete" confirm button below the row
    await page.getByRole('button', { name: /^Delete$/ }).last().click()
    await expect(page.getByText(q.name)).not.toBeVisible({ timeout: 5000 })
  })'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ Patched duplicate and delete tests to scope to questionnaire row")
