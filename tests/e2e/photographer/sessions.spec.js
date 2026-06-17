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

// ── DB helpers ────────────────────────────────────────────────────────────────

async function createTestClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Test',
    last_name: `Client-${uid}`,
    email: `test-${uid}@example.com`,
    tags: [],
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestClient(id) {
  await sb().from('clients').delete().eq('id', id)
}

async function createTestSession(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('sessions').insert({
    photographer_id: photographerId,
    name: `Test Session ${uid}`,
    type: 'Portrait',
    mode: 'private',
    status: 'inquiry',
    submit_token: crypto.randomUUID().replace(/-/g, ''),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestSession(id) {
  await sb().from('session_questionnaires').delete().eq('session_id', id)
  await sb().from('session_submissions').delete().eq('session_id', id)
  await sb().from('contracts').delete().eq('session_id', id)
  await sb().from('sessions').delete().eq('id', id)
}

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
  await sb().from('questionnaire_questions').delete().eq('questionnaire_id', id)
  await sb().from('session_questionnaires').delete().eq('questionnaire_id', id)
  await sb().from('questionnaire_templates').delete().eq('id', id)
}

// Helper: click Walk-up mode card button (not the select option)
function walkUpCard(page) {
  return page.locator('button').filter({ hasText: /^Walk-up/ }).first()
}

// ── Sessions List ─────────────────────────────────────────────────────────────

test.describe('Sessions list', () => {
  test('navigates to sessions page', async ({ page }) => {
    await page.goto('/sessions')
    await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  })

  test('shows New Session button', async ({ page }) => {
    await page.goto('/sessions')
    await expect(page.getByRole('button', { name: /New Session/i }).first()).toBeVisible()
  })

  test('shows search input', async ({ page }) => {
    await page.goto('/sessions')
    await expect(page.locator('input[placeholder="Search sessions or clients..."]').first()).toBeVisible()
  })

  test('existing session appears in list view', async ({ page }) => {
    const session = await createTestSession()
    try {
      await page.goto('/sessions')
      await page.getByRole('button', { name: 'List' }).first().click()
      await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestSession(session.id)
    }
  })

  test('existing session appears in kanban view', async ({ page }) => {
    const session = await createTestSession({ status: 'inquiry' })
    try {
      await page.goto('/sessions')
      await page.getByRole('button', { name: 'Board' }).first().click()
      await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestSession(session.id)
    }
  })

  test('search filters sessions by name', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const session = await createTestSession({ name: `Searchable-${uid}` })
    try {
      await page.goto('/sessions')
      await page.locator('input[placeholder="Search sessions or clients..."]').first().fill(`Searchable-${uid}`)
      await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestSession(session.id)
    }
  })

  test('walk-up badge shows on walk-up sessions in kanban', async ({ page }) => {
    const session = await createTestSession({ mode: 'walkup', status: 'booked' })
    try {
      await page.goto('/sessions')
      await page.getByRole('button', { name: 'Board' }).first().click()
      // Walk-up badge is a span, not a button — scope away from select options
      await expect(page.locator('span').filter({ hasText: /^Walk-up$/ }).first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestSession(session.id)
    }
  })
})

// ── New Session Modal ─────────────────────────────────────────────────────────

test.describe('New Session modal', () => {
  test('opens modal with step 1', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await expect(page.getByRole('heading', { name: 'New Session' })).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Smith Family Portrait')).toBeVisible()
  })

  test('Next button disabled without session name', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await expect(page.getByRole('button', { name: /Next/i })).toBeDisabled()
  })

  test('step 1 shows mode selector cards', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await expect(page.locator('button').filter({ hasText: /^Private/ }).first()).toBeVisible()
    await expect(page.locator('button').filter({ hasText: /^Walk-up/ }).first()).toBeVisible()
  })

  test('advances to step 2', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill('Test Session')
    await page.getByRole('button', { name: /Next/i }).click()
    await expect(page.getByText('Details').first()).toBeVisible()
  })

  test('step 2 shows ClientPicker for private mode', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill('Test Session')
    await page.getByRole('button', { name: /Next/i }).click()
    await expect(page.getByText('Link client').first()).toBeVisible()
    await expect(page.getByText('Link to a client...').first()).toBeVisible()
  })

  test('step 2 does not show ClientPicker for walk-up mode', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill('Test Session')
    await walkUpCard(page).click()
    await page.getByRole('button', { name: /Next/i }).click()
    await expect(page.getByText('Link to a client...')).not.toBeVisible()
  })

  test('private mode has 3 steps, walk-up has 2', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await expect(page.getByText('Financials').first()).toBeVisible()
    await walkUpCard(page).click()
    await expect(page.getByText('Financials')).not.toBeVisible()
  })

  test('creates a private session and navigates to detail', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Playwright Session ${uid}`
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill(name)
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: 'Create Session' }).click()
    await expect(page).toHaveURL(/\/sessions\//, { timeout: 8000 })
    await expect(page.getByText(name).first()).toBeVisible()

    const photographerId = await getPhotographerId()
    const { data } = await sb().from('sessions').select('id').eq('name', name).eq('photographer_id', photographerId).single()
    if (data) await deleteTestSession(data.id)
  })

  test('creates a walk-up session and navigates to detail', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Walkup Session ${uid}`
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill(name)
    await walkUpCard(page).click()
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: 'Create Session' }).click()
    await expect(page).toHaveURL(/\/sessions\//, { timeout: 8000 })

    const photographerId = await getPhotographerId()
    const { data } = await sb().from('sessions').select('id').eq('name', name).eq('photographer_id', photographerId).single()
    if (data) await deleteTestSession(data.id)
  })
})

// ── Session Detail ────────────────────────────────────────────────────────────

test.describe('Session detail', () => {
  let session

  test.beforeEach(async () => {
    session = await createTestSession({
      name: 'Detail Test Session',
      type: 'Portrait',
      mode: 'private',
      status: 'booked',
      session_date: '2026-08-15',
    })
  })

  test.afterEach(async () => {
    await deleteTestSession(session.id)
  })

  test('navigates to session detail page', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await expect(page).toHaveURL(`/sessions/${session.id}`)
    await expect(page.getByText('Detail Test Session').first()).toBeVisible()
  })

  test('shows session type', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await expect(page.getByText('Portrait').first()).toBeVisible()
  })

  test('shows Edit button', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await expect(page.getByRole('button', { name: /Edit/i }).first()).toBeVisible()
  })

  test('opens edit modal', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Edit Session' })).toBeVisible()
  })

  test('edit modal shows session name in input', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(page.locator('input[type="text"]').filter({ hasText: '' }).first()).toBeVisible()
    // Verify the value is correct
    const val = await page.locator('input[type="text"]').first().inputValue()
    expect(val).toBe('Detail Test Session')
  })

  test('edit modal saves name change', async ({ page }) => {
    const newName = `Renamed Session ${crypto.randomUUID().slice(0, 8)}`
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    const nameInput = page.locator('input[type="text"]').first()
    await nameInput.fill(newName)
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByText(newName).first()).toBeVisible({ timeout: 5000 })

    const { data } = await sb().from('sessions').select('name').eq('id', session.id).single()
    expect(data.name).toBe(newName)
  })

  test('edit modal shows ClientPicker for private session', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await page.getByRole('button', { name: /Edit/i }).first().click()
    await expect(page.getByText('Client').first()).toBeVisible()
    await expect(page.getByText('Link to a client...').first()).toBeVisible()
  })

  test('edit modal can link a client', async ({ page }) => {
    const client = await createTestClient({ first_name: 'Linked', last_name: 'ClientTest' })
    try {
      await page.goto(`/sessions/${session.id}`)
      await page.getByRole('button', { name: /Edit/i }).first().click()
      await page.getByText('Link to a client...').first().click()
      await page.getByPlaceholder('Search by name or email...').fill('Linked')
      await page.getByText('Linked ClientTest').first().click()
      await page.getByRole('button', { name: 'Save Changes' }).click()
      await expect(page.getByText('Linked ClientTest').first()).toBeVisible({ timeout: 5000 })
    } finally {
      await deleteTestClient(client.id)
    }
  })

  test('shows status pills', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await expect(page.getByText('Booked').first()).toBeVisible()
  })

  test('shows financials section for private session', async ({ page }) => {
    await page.goto(`/sessions/${session.id}`)
    await expect(page.getByText(/Session fee|Financials/i).first()).toBeVisible()
  })
})

// ── Session Submissions — Delete ────────────────────────────────────────────

test.describe('Session Submissions — Delete', () => {
  let session

  test.beforeEach(async () => {
    session = await createTestSession({
      name: 'Submission Delete Test Session',
      type: 'Convention',
      mode: 'walk-up',
      status: 'booked',
    })
  })

  test.afterEach(async () => {
    await deleteTestSession(session.id)
  })

  async function createTestSubmission(overrides = {}) {
    const uid = crypto.randomUUID().slice(0, 8)
    const { data, error } = await sb().from('session_submissions').insert({
      session_id: session.id,
      email: `submission-${uid}@example.com`,
      credit_handle: `Handle-${uid}`,
      questions: [],
      answers: {},
      submitted_at: new Date().toISOString(),
      ...overrides,
    }).select().single()
    if (error) throw new Error(error.message)
    return data
  }

  test('Delete button appears when a submission row is expanded', async ({ page }) => {
    const submission = await createTestSubmission()
    await page.goto(`/sessions/${session.id}`)
    await page.getByText(submission.credit_handle).first().click()
    await expect(page.getByRole('button', { name: /^Delete$/ }).first()).toBeVisible()
  })

  test('clicking Delete shows confirm/cancel', async ({ page }) => {
    const submission = await createTestSubmission()
    await page.goto(`/sessions/${session.id}`)
    await page.getByText(submission.credit_handle).first().click()
    await page.getByRole('button', { name: /^Delete$/ }).first().click()
    await expect(page.getByText('Delete this submission?')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('Cancel dismisses the confirm without deleting', async ({ page }) => {
    const submission = await createTestSubmission()
    await page.goto(`/sessions/${session.id}`)
    await page.getByText(submission.credit_handle).first().click()
    await page.getByRole('button', { name: /^Delete$/ }).first().click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(submission.credit_handle).first()).toBeVisible()

    const { data } = await sb().from('session_submissions').select('id').eq('id', submission.id).maybeSingle()
    expect(data).not.toBeNull()
  })

  test('Confirm removes the submission from the list and database', async ({ page }) => {
    const submission = await createTestSubmission()
    await page.goto(`/sessions/${session.id}`)
    await page.getByText(submission.credit_handle).first().click()
    await page.getByRole('button', { name: /^Delete$/ }).first().click()
    await page.getByRole('button', { name: 'Confirm' }).click()
    await expect(page.getByText(submission.credit_handle)).not.toBeVisible({ timeout: 5000 })

    const { data } = await sb().from('session_submissions').select('id').eq('id', submission.id).maybeSingle()
    expect(data).toBeNull()
  })
})

// ── Session — Client Detail Card ──────────────────────────────────────────────

test.describe('Sessions card on Client Detail', () => {
  let client
  let session

  test.beforeEach(async () => {
    client = await createTestClient({ first_name: 'Session', last_name: 'CardTest' })
    session = await createTestSession({ name: 'Client Card Session', client_id: client.id })
  })

  test.afterEach(async () => {
    await deleteTestSession(session.id)
    await deleteTestClient(client.id)
  })

  test('session appears in client detail sessions card', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await expect(page.getByText('Client Card Session').first()).toBeVisible({ timeout: 5000 })
  })

  test('session row links to session detail', async ({ page }) => {
    await page.goto(`/clients/${client.id}`)
    await page.getByText('Client Card Session').first().click()
    await expect(page).toHaveURL(`/sessions/${session.id}`)
  })
})

// ── Questionnaire Templates ───────────────────────────────────────────────────

test.describe('Questionnaire templates', () => {
  test('questionnaire templates section appears under Templates tab', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Questionnaire Templates').first()).toBeVisible({ timeout: 8000 })
  })

  test('shows New Template button for questionnaires', async ({ page }) => {
    await page.goto('/account?tab=templates')
    await page.waitForLoadState('networkidle')
    // There are multiple "New Template" buttons — the last one is questionnaires
    await expect(page.getByRole('button', { name: /New Template/i }).last()).toBeVisible({ timeout: 8000 })
  })

  test('existing questionnaire template appears in list', async ({ page }) => {
    const q = await createTestQuestionnaireTemplate()
    try {
      await page.goto('/account?tab=templates')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(q.name).first()).toBeVisible({ timeout: 8000 })
    } finally {
      await deleteTestQuestionnaireTemplate(q.id)
    }
  })

  test('can duplicate a questionnaire template', async ({ page }) => {
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
  })

  test('can delete a questionnaire template', async ({ page }) => {
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
    await expect(page.locator("p.text-sm.font-medium").filter({ hasText: q.name })).not.toBeVisible({ timeout: 5000 })
  })
})

// ── Walk-up Submission Form ───────────────────────────────────────────────────

test.describe('Walk-up submission form', () => {
  let session
  let questionnaire

  test.beforeEach(async () => {
    questionnaire = await createTestQuestionnaireTemplate()
    session = await createTestSession({ mode: 'walkup', status: 'booked' })
    await sb().from('session_questionnaires').insert({
      session_id: session.id,
      questionnaire_id: questionnaire.id,
    })
  })

  test.afterEach(async () => {
    await deleteTestSession(session.id)
    await deleteTestQuestionnaireTemplate(questionnaire.id)
  })

  test('submission form renders at /submit/:token', async ({ page }) => {
    await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
    await expect(page.getByText(session.name).first()).toBeVisible({ timeout: 8000 })
  })

  test('submission form shows session name as heading', async ({ page }) => {
    await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: session.name })).toBeVisible({ timeout: 10000 })
  })

  test('invalid token shows error', async ({ page }) => {
    await page.goto(`/submit/invalidtoken123?q=${questionnaire.id}`)
    await expect(page.getByText(/not found|invalid|error/i).first()).toBeVisible({ timeout: 8000 })
  })
})

// ── Session questionnaire assignment ─────────────────────────────────────────

test.describe('Session questionnaire assignment', () => {
  let questionnaire

  test.beforeEach(async () => {
    questionnaire = await createTestQuestionnaireTemplate()
  })

  test.afterEach(async () => {
    await deleteTestQuestionnaireTemplate(questionnaire.id)
  })

  test('step 2 shows questionnaire checkbox', async ({ page }) => {
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill('Q Test Session')
    await page.getByRole('button', { name: /Next/i }).click()
    await expect(page.getByText(questionnaire.name).first()).toBeVisible({ timeout: 5000 })
  })

  test('can assign questionnaire during session creation', async ({ page }) => {
    const uid = crypto.randomUUID().slice(0, 8)
    const name = `Q Assign Session ${uid}`
    await page.goto('/sessions')
    await page.getByRole('button', { name: /New Session/i }).first().click()
    await page.getByPlaceholder('e.g. Smith Family Portrait').fill(name)
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByText(questionnaire.name).first().click()
    await page.getByRole('button', { name: /Next/i }).click()
    await page.getByRole('button', { name: 'Create Session' }).click()
    await expect(page).toHaveURL(/\/sessions\//, { timeout: 8000 })

    const photographerId = await getPhotographerId()
    const { data: sessionData } = await sb().from('sessions').select('id').eq('name', name).eq('photographer_id', photographerId).single()
    if (sessionData) {
      const { data: sqData } = await sb().from('session_questionnaires').select('questionnaire_id').eq('session_id', sessionData.id)
      expect(sqData?.map(r => r.questionnaire_id)).toContain(questionnaire.id)
      await deleteTestSession(sessionData.id)
    }
  })
})
