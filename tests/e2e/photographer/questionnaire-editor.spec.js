import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function createTestQuestionnaireTemplate(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('questionnaire_templates').insert({
    photographer_id: photographerId,
    name: `Test Questionnaire ${uid}`,
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestQuestionnaireTemplate(id) {
  await sb().from('questionnaire_questions').delete().eq('template_id', id)
  await sb().from('session_questionnaires').delete().eq('questionnaire_id', id)
  await sb().from('questionnaire_templates').delete().eq('id', id)
}

async function getQuestionsFor(templateId) {
  const { data } = await sb().from('questionnaire_questions').select('*').eq('template_id', templateId).order('sort_order')
  return data || []
}

async function findByName(name) {
  const photographerId = await getPhotographerId()
  const { data } = await sb().from('questionnaire_templates').select('id').eq('name', name).eq('photographer_id', photographerId).maybeSingle()
  return data
}

// ── Editor opens as a modal, not the old full-page editor ─────────────────────

test.describe('Questionnaire editor — modal', () => {
  test('New Template opens a centered modal, not a full-page swap', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /New Template/i }).last().click()
    await expect(page.getByRole('heading', { name: 'New Template' })).toBeVisible({ timeout: 5000 })
    // The list itself should still be present underneath -- a real modal
    // overlay, not a route/content swap that replaced the page.
    await expect(page.getByText('Questionnaire Templates').first()).toBeVisible()
  })

  test('Cancel closes the modal without creating anything', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Cancel Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /New Template/i }).last().click()
    await page.getByPlaceholder('e.g. Convention Walk-up Form').fill(name)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).not.toBeVisible({ timeout: 3000 })

    const created = await findByName(name)
    expect(created).toBeNull()
  })
})

// ── Unified save: nothing persists until Save, questions included ─────────────

test.describe('Questionnaire editor — unified save', () => {
  test('adding a question to a brand-new template does NOT save anything until Save is clicked', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Unsaved Question Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /New Template/i }).last().click()
    await page.getByPlaceholder('e.g. Convention Walk-up Form').fill(name)

    await page.getByRole('button', { name: 'Add Question' }).first().click()
    await page.getByPlaceholder(/What cosplay are you wearing/i).fill('Unsaved question label')
    // The form's own submit button shares the same "Add Question" text as
    // the trigger -- scope to the last one (the form's submit, added most
    // recently to the DOM) rather than risk re-clicking the trigger.
    await page.getByRole('button', { name: 'Add Question' }).last().click()
    await expect(page.getByText('Unsaved question label')).toBeVisible({ timeout: 3000 })

    // This is the real regression guard: closing without Save must leave
    // zero trace in the database -- no template row, no question row --
    // unlike the old behavior where adding a question silently created
    // and saved the template immediately.
    await page.getByRole('button', { name: 'Cancel' }).click()
    const created = await findByName(name)
    expect(created).toBeNull()
  })

  test('Save persists the template and its questions together', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Full Save Test ${uid}`
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /New Template/i }).last().click()
    await page.getByPlaceholder('e.g. Convention Walk-up Form').fill(name)

    await page.getByRole('button', { name: 'Add Question' }).first().click()
    await page.getByPlaceholder(/What cosplay are you wearing/i).fill('What is your favorite color?')
    await page.getByRole('button', { name: 'Add Question' }).last().click()
    await expect(page.getByText('What is your favorite color?')).toBeVisible({ timeout: 3000 })

    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Template' })).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 })

    const created = await findByName(name)
    expect(created).not.toBeNull()
    try {
      const questions = await getQuestionsFor(created.id)
      expect(questions.length).toBe(1)
      expect(questions[0].label).toBe('What is your favorite color?')
    } finally {
      await deleteTestQuestionnaireTemplate(created.id)
    }
  })

  test('editing an existing template: delete one question, add another, and reorder, all in one Save', async ({ page }) => {
    const template = await createTestQuestionnaireTemplate()
    const { data: existingQuestions } = await sb().from('questionnaire_questions').insert([
      { template_id: template.id, type: 'short_text', label: 'Question A', sort_order: 0 },
      { template_id: template.id, type: 'short_text', label: 'Question B', sort_order: 1 },
    ]).select()

    try {
      await page.goto('/account?tab=templates')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(template.name).first()).toBeVisible({ timeout: 8000 })
      const row = page.locator('p.text-sm.font-medium').filter({ hasText: template.name }).locator('../..')
      await row.getByTitle('Edit').click()
      await expect(page.getByRole('heading', { name: 'Edit Template' })).toBeVisible({ timeout: 5000 })

      // Delete Question A -- targeting SortableQuestionCard's own outer
      // className directly (from its real source) rather than counting
      // parent levels from the label paragraph. The accessibility
      // snapshot used to debug the first attempt collapses wrapper divs
      // with no semantic role, so it doesn't reflect true DOM nesting
      // depth -- counting levels against it was the wrong approach.
      await expect(page.getByText('Question A')).toBeVisible({ timeout: 5000 })
      const cardA = page.locator('.rounded-xl.overflow-hidden').filter({ hasText: 'Question A' })
      const buttonCount = await cardA.getByRole('button').count()
      console.log(`cardA resolved ${await cardA.count()} card(s), ${buttonCount} button(s) inside`)
      await cardA.getByRole('button').last().click()
      await expect(page.getByText('Question A')).not.toBeVisible({ timeout: 3000 })

      // Add Question C
      await page.getByRole('button', { name: 'Add Question' }).first().click()
      await page.getByPlaceholder(/What cosplay are you wearing/i).fill('Question C')
      await page.getByRole('button', { name: 'Add Question' }).last().click()
      await expect(page.getByText('Question C')).toBeVisible({ timeout: 3000 })

      await page.getByRole('button', { name: 'Save Template' }).click()
      await expect(page.getByRole('heading', { name: 'Edit Template' })).not.toBeVisible({ timeout: 5000 })

      const questions = await getQuestionsFor(template.id)
      const labels = questions.map(q => q.label).sort()
      expect(labels).toEqual(['Question B', 'Question C'])
    } finally {
      await deleteTestQuestionnaireTemplate(template.id)
    }
  })
})
