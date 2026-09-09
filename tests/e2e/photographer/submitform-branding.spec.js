import { test, expect } from '../../fixtures/fixtures.js'

/**
 * SubmitForm branding/cover rendering -- the new visual layer added this
 * session (useBookingBranding/BrandHeader/BookingCover, the
 * get_submit_form_data RPC, the Session Type eyebrow). The pre-existing
 * Walk-up submission form tests in sessions.spec.js already cover the
 * functional side (renders, errors, redirect) and were confirmed still
 * passing after this rewrite -- this file is specifically the new
 * branding-layer coverage that didn't exist before.
 */

async function getPhotographerId(sb) {
  const { data: { users } } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test photographer not found (looking for ${process.env.PLAYWRIGHT_TEST_EMAIL})`)
  return user.id
}

async function createTestSession(sb, overrides = {}) {
  const photographerId = await getPhotographerId(sb)
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb.from('sessions').insert({
    photographer_id: photographerId,
    name: `Branding Test Session ${uid}`,
    mode: 'walkup',
    status: 'inquiry',
    submit_token: crypto.randomUUID().replace(/-/g, ''),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestSession(sb, id) {
  await sb.from('session_questionnaires').delete().eq('session_id', id)
  await sb.from('session_submissions').delete().eq('session_id', id)
  await sb.from('sessions').delete().eq('id', id)
}

async function createTestQuestionnaireTemplate(sb, overrides = {}) {
  const photographerId = await getPhotographerId(sb)
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb.from('questionnaire_templates').insert({
    photographer_id: photographerId,
    name: `Branding Test Questionnaire ${uid}`,
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function deleteTestQuestionnaireTemplate(sb, id) {
  await sb.from('questionnaire_questions').delete().eq('template_id', id)
  await sb.from('session_questionnaires').delete().eq('questionnaire_id', id)
  await sb.from('questionnaire_templates').delete().eq('id', id)
}

// ── Branding: real microsite vs. no-microsite fallback ─────────────────────

test.describe('SubmitForm — branding', () => {
  test('with an enabled microsite, the studio name renders via BrandHeader', async ({ page, sb, testMicrosite, withPremiumAccess }) => {
    const { error } = await sb.from('microsites').upsert({
      photographer_id: testMicrosite.photographerId,
      enabled: true,
      studio_name: 'Branding Test Studio',
      accent_color: '#C23B3B',
    }, { onConflict: 'photographer_id' })
    if (error) throw new Error(error.message)

    const questionnaire = await createTestQuestionnaireTemplate(sb)
    const session = await createTestSession(sb)
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      await expect(page.getByText('Branding Test Studio')).toBeVisible({ timeout: 10000 })
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })

  test('with no microsite enabled, the form still renders with a plain fallback', async ({ page, sb, testMicrosite }) => {
    await sb.from('microsites').update({ enabled: false }).eq('photographer_id', testMicrosite.photographerId)

    const questionnaire = await createTestQuestionnaireTemplate(sb)
    const session = await createTestSession(sb)
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      // Not asserting exact fallback text (business_name/display_name
      // vary per account) -- the real regression guard is that the page
      // loads a real heading at all, rather than erroring or rendering
      // blank when there's no microsite to pull branding from.
      await expect(page.getByRole('heading', { name: session.name })).toBeVisible({ timeout: 10000 })
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })
})

// ── Cover image vs. illustrated pattern fallback ────────────────────────────

test.describe('SubmitForm — cover image', () => {
  test('a questionnaire with a cover image shows the real photo', async ({ page, sb }) => {
    const questionnaire = await createTestQuestionnaireTemplate(sb, {
      cover_image_r2_key: 'photographers/fake/test/submit-cover-marker.webp',
      cover_focus_x: 0.5,
      cover_focus_y: 0.5,
    })
    const session = await createTestSession(sb)
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      await expect(page.getByRole('heading', { name: session.name })).toBeVisible({ timeout: 10000 })
      const coverImg = page.locator('[data-testid="booking-cover"] img')
      await expect(coverImg).toHaveAttribute('src', /submit-cover-marker/)
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })

  test('a questionnaire with no cover image shows the illustrated pattern instead', async ({ page, sb }) => {
    const questionnaire = await createTestQuestionnaireTemplate(sb, { cover_image_r2_key: null })
    const session = await createTestSession(sb)
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      await expect(page.getByRole('heading', { name: session.name })).toBeVisible({ timeout: 10000 })
      const cover = page.locator('[data-testid="booking-cover"]')
      await expect(cover.locator('svg')).toBeVisible()
      await expect(cover.locator('img')).toHaveCount(0)
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })
})

// ── Session Type eyebrow ────────────────────────────────────────────────────

test.describe('SubmitForm — session type eyebrow', () => {
  test('a session with a type shows it as an eyebrow above the title', async ({ page, sb }) => {
    const questionnaire = await createTestQuestionnaireTemplate(sb)
    const session = await createTestSession(sb, { type: 'Convention' })
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      await expect(page.getByRole('heading', { name: session.name })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Convention', { exact: true })).toBeVisible()
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })

  test('a session with an empty-string type shows no eyebrow at all', async ({ page, sb }) => {
    const questionnaire = await createTestQuestionnaireTemplate(sb)
    // sessions.type is NOT NULL in the real schema -- an actually-null
    // type isn't a reachable state, so the closer real edge case is an
    // empty string, which the DB allows and which {session.session_type
    // && (...)} should still correctly treat as falsy.
    const session = await createTestSession(sb, { type: '' })
    await sb.from('session_questionnaires').insert({ session_id: session.id, questionnaire_id: questionnaire.id })

    try {
      await page.goto(`/submit/${session.submit_token}?q=${questionnaire.id}`)
      await expect(page.getByRole('heading', { name: session.name })).toBeVisible({ timeout: 10000 })
      // Scoped to the title card specifically (identified by containing
      // the session name heading) -- with both session.type and
      // session.description unset in this fixture, the real component
      // renders neither the eyebrow <p> nor the description <p> at all,
      // so the card should have zero <p> children, not an empty one.
      const titleCard = page.locator('.rounded-2xl').filter({ has: page.getByRole('heading', { name: session.name }) })
      await expect(titleCard.locator('p')).toHaveCount(0)
    } finally {
      await deleteTestSession(sb, session.id)
      await deleteTestQuestionnaireTemplate(sb, questionnaire.id)
    }
  })
})
