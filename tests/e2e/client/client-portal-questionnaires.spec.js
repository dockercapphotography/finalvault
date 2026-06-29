import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Session/questionnaire fixture shapes match tests/e2e/photographer/
// sessions.spec.js exactly (submit_token on sessions, name-only minimum
// on questionnaire_templates, FK-safe cleanup order). This suite is
// anonymous/portal-facing though, not the authenticated dashboard, so it
// uses contextOptions: { storageState: undefined } like the other portal
// spec files rather than sessions.spec.js's authenticated storageState.

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
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

async function createTestClient(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('clients').insert({
    photographer_id: photographerId,
    first_name: 'Portal',
    last_name: `Test-${uid}`,
    email: `portal-test-${uid}@example.com`,
    portal_token: crypto.randomUUID().replace(/-/g, ''),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createTestSession(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('sessions').insert({
    photographer_id: photographerId,
    name: `Portal Test Session ${uid}`,
    type: 'Portrait',
    mode: 'private',
    status: 'booked',
    submit_token: crypto.randomUUID().replace(/-/g, ''),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createTestQuestionnaireTemplate(overrides = {}) {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('questionnaire_templates').insert({
    photographer_id: photographerId,
    name: `Portal Test Questionnaire ${uid}`,
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function linkQuestionnaireToSession(sessionId, questionnaireId, sortOrder = 0) {
  const { error } = await sb().from('session_questionnaires').insert({
    session_id: sessionId,
    questionnaire_id: questionnaireId,
    sort_order: sortOrder,
  })
  if (error) throw new Error(error.message)
}

// Simulates a real submission via the public /submit/:token flow's actual
// insert shape (session_submissions.client_id is never populated by that
// flow -- confirmed against 10 real production rows during development --
// only email is reliable, which is exactly the bug the portal's RPC had
// to be fixed to account for).
async function createTestSubmission(sessionId, questionnaireId, email, overrides = {}) {
  const { data, error } = await sb().from('session_submissions').insert({
    session_id: sessionId,
    questionnaire_id: questionnaireId,
    email,
    questions: [],
    answers: {},
    submitted_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// FK-safe order, matching deleteTestSession/deleteTestQuestionnaireTemplate
// in sessions.spec.js.
async function cleanup({ clientId, sessionId, questionnaireId } = {}) {
  if (sessionId) {
    await sb().from('session_submissions').delete().eq('session_id', sessionId)
    await sb().from('session_questionnaires').delete().eq('session_id', sessionId)
    await sb().from('sessions').delete().eq('id', sessionId)
  }
  if (questionnaireId) {
    await sb().from('questionnaire_questions').delete().eq('questionnaire_id', questionnaireId)
    await sb().from('questionnaire_templates').delete().eq('id', questionnaireId)
  }
  if (clientId) await sb().from('clients').delete().eq('id', clientId)
}

async function waitForPortalReady(page) {
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
}

test.use({ contextOptions: { storageState: undefined } })

// ── Outstanding detection ──────────────────────────────────────────────────────

test.describe('Client portal — outstanding questionnaires', () => {
  test('a questionnaire attached to the clients session with no submission shows as outstanding', async ({ page }) => {
    const client = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText(questionnaire.name)).toBeVisible()
      await expect(page.getByText(session.name)).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
    }
  })

  test('the submit link includes the correct q= questionnaire id param', async ({ page }) => {
    const client = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      const link = page.getByRole('link', { name: questionnaire.name })
      await expect(link).toHaveAttribute(
        'href',
        `/submit/${session.submit_token}?q=${questionnaire.id}`
      )
    } finally {
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
    }
  })

  test('no questionnaires shows the "Nothing outstanding" empty state', async ({ page }) => {
    const client = await createTestClient()

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText('Nothing outstanding')).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id })
    }
  })
})

// ── Submission matching (the real bug fix) ────────────────────────────────────
// session_submissions.client_id is never populated by the real submit
// flow -- only email is reliable. The portal RPC originally matched on
// client_id (always null, so nothing was ever detected as complete) before
// being fixed to match by lowercased/trimmed email instead. These tests
// are the regression guard for that exact fix.

test.describe('Client portal — questionnaire completion matching', () => {
  test('a real submission matched by email removes the questionnaire from the outstanding list', async ({ page }) => {
    const client = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)
    const submission = await createTestSubmission(session.id, questionnaire.id, client.email)

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText('Nothing outstanding')).toBeVisible()
      await expect(page.getByText(questionnaire.name)).not.toBeVisible()
    } finally {
      await sb().from('session_submissions').delete().eq('id', submission.id)
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
    }
  })

  test('email match is case- and whitespace-insensitive', async ({ page }) => {
    const client = await createTestClient({ email: 'Jane.Doe@Example.com' })
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)
    // Submission recorded with different case and surrounding whitespace
    // than the client's stored email -- the RPC normalizes both sides
    // with lower(trim(...)) before comparing.
    const submission = await createTestSubmission(session.id, questionnaire.id, '  jane.doe@example.com  ')

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText('Nothing outstanding')).toBeVisible()
    } finally {
      await sb().from('session_submissions').delete().eq('id', submission.id)
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
    }
  })

  test('a submission with a null client_id still correctly resolves as complete (the real-world shape)', async ({ page }) => {
    const client = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)
    // client_id deliberately omitted/null -- matches every real
    // session_submissions row found in production during development.
    const submission = await createTestSubmission(session.id, questionnaire.id, client.email, { client_id: null })

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText('Nothing outstanding')).toBeVisible()
    } finally {
      await sb().from('session_submissions').delete().eq('id', submission.id)
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
    }
  })

  test('a different clients submission to the same questionnaire does not mark it complete for this client', async ({ page }) => {
    const client = await createTestClient()
    const otherClient = await createTestClient()
    const session = await createTestSession({ client_id: client.id })
    const questionnaire = await createTestQuestionnaireTemplate()
    await linkQuestionnaireToSession(session.id, questionnaire.id)
    // Wrong email entirely -- a different client's submission must not
    // satisfy this client's outstanding check.
    const submission = await createTestSubmission(session.id, questionnaire.id, otherClient.email)

    try {
      await page.goto(`/client/${client.portal_token}/questionnaires`)
      await waitForPortalReady(page)
      await expect(page.getByText(questionnaire.name)).toBeVisible()
    } finally {
      await sb().from('session_submissions').delete().eq('id', submission.id)
      await cleanup({ clientId: client.id, sessionId: session.id, questionnaireId: questionnaire.id })
      await cleanup({ clientId: otherClient.id })
    }
  })
})
