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
  const { data: { users } } = await sb().auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

async function createSignupPage(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('signup_pages').insert({
    photographer_id: photographerId,
    title: 'Management Test Page',
    token: `mgmt-test-${crypto.randomUUID().slice(0, 8)}`,
    venue_address: '123 Test St, Columbus, OH',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createShootType(pageId, overrides = {}) {
  const { data, error } = await sb().from('signup_shoot_types').insert({
    signup_page_id: pageId, name: 'Test Shoot', duration_minutes: 15, session_type: 'Portrait', sort_order: 0, ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createSlot(pageId, shootTypeId, startTime, endTime, claimedAt = null) {
  const { data, error } = await sb().from('signup_slots').insert({
    signup_page_id: pageId, shoot_type_id: shootTypeId, start_time: startTime, end_time: endTime,
    claimed_at: claimedAt, client_name: claimedAt ? 'Already Booked' : null, client_email: claimedAt ? 'already@example.com' : null,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function createQuestionnaireTemplate(overrides = {}) {
  const photographerId = await getPhotographerId()
  const { data, error } = await sb().from('questionnaire_templates').insert({
    photographer_id: photographerId, name: 'Test Questionnaire', updated_at: new Date().toISOString(), ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupSignupPage(pageId) {
  await sb().from('signup_pages').delete().eq('id', pageId)
}

async function cleanupQuestionnaire(id) {
  await sb().from('questionnaire_templates').delete().eq('id', id)
}

test.use({ storageState: 'tests/.auth/photographer.json' })

async function goToSignups(page) {
  await page.goto('/sessions')
  await page.getByRole('button', { name: 'Sign-ups' }).click()
}

test.describe('Sign-ups — page management', () => {
  test('header shows "New signup page" only while on the Sign-ups tab', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Header Button Test Page' })
    try {
      await page.goto('/sessions')
      await expect(page.getByRole('button', { name: 'New Session' }).first()).toBeVisible()
      await page.getByRole('button', { name: 'Sign-ups' }).click()
      // Two genuinely separate buttons can say "New signup page" -- the
      // header action and (if the list happens to render empty) the
      // SignupPagesView empty-state CTA -- both do the same thing, so
      // .first() is the right call here rather than fighting over which
      // exact one is showing.
      await expect(page.getByRole('button', { name: 'New signup page' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'New Session', exact: true })).not.toBeVisible()
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('creates a new signup page', async ({ page }) => {
    await goToSignups(page)
    await page.getByRole('button', { name: 'New signup page' }).first().click()
    await page.getByPlaceholder('GenCon 2026 Photo Sessions').fill('Playwright Test Con')
    await page.getByRole('button', { name: 'Create' }).click()
    // The detail modal auto-opens right after creation, so the title
    // legitimately appears twice at once: once on the card behind it,
    // once as the modal's own heading. Either confirms success.
    await expect(page.getByText('Playwright Test Con').first()).toBeVisible({ timeout: 10000 })

    // .single() throws if more than one row matches, which stray rows from
    // earlier failed runs (before this cleanup line was ever reached) can
    // cause -- fetch all matches and clean up every one, not just assume
    // there's exactly one.
    const { data: created, error: fetchError } = await sb().from('signup_pages').select('id').eq('title', 'Playwright Test Con')
    expect(fetchError, fetchError?.message).toBeNull()
    for (const row of created ?? []) {
      await cleanupSignupPage(row.id)
    }
  })

  test('adds, edits, and deletes a shoot type', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Shoot Type CRUD Page' })
    try {
      await goToSignups(page)
      await page.getByText('Shoot Type CRUD Page').click()
      await expect(page.getByText('No shoot types yet.')).toBeVisible()

      await page.getByText('+ Add shoot type').click()
      await page.getByPlaceholder('Cosplay Portrait').fill('Group Shoot')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('button', { name: /^Group Shoot/ })).toBeVisible()

      // Edit -- the shoot type's own name also appears as an <option> in
      // the slot generator's dropdown further down the page, so getByText
      // alone is ambiguous; scoping to role="button" (the row itself)
      // avoids matching the <option role="option">.
      await page.getByRole('button', { name: /^Group Shoot/ }).click()
      await page.locator('input[value="Group Shoot"]').fill('Renamed Shoot')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('button', { name: /^Renamed Shoot/ })).toBeVisible()

      // Delete
      await page.getByRole('button', { name: 'Delete Renamed Shoot' }).click()
      await expect(page.getByText('No shoot types yet.')).toBeVisible({ timeout: 10000 })

      const { data: shootTypes } = await sb().from('signup_shoot_types').select('id').eq('signup_page_id', signupPage.id)
      expect(shootTypes.length).toBe(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('generates slots for a single day', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Single Day Gen Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Quick Portrait', duration_minutes: 30 })
    try {
      await goToSignups(page)
      await page.getByText('Single Day Gen Page').click()
      await expect(page.getByRole('button', { name: /^Quick Portrait/ })).toBeVisible()

      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-01')
      await page.getByRole('button', { name: /Generate slots for this day/ }).click()
      await expect(page.getByText(/slots created/)).toBeVisible({ timeout: 10000 })

      const { data: slots } = await sb().from('signup_slots').select('id').eq('signup_page_id', signupPage.id)
      expect(slots.length).toBeGreaterThan(0)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('generates slots across a multi-day range', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Multi Day Gen Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Con Portrait', duration_minutes: 60 })
    try {
      await goToSignups(page)
      await page.getByText('Multi Day Gen Page').click()
      await expect(page.getByRole('button', { name: /^Con Portrait/ })).toBeVisible()

      await page.getByText('Start date', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-10')
      await page.getByText('End date (optional)', { exact: true })
        .locator('xpath=following-sibling::input[@type="date"][1]').fill('2026-09-12')
      await page.getByRole('button', { name: /Generate slots for these days/ }).click()
      await expect(page.getByText(/slots created/)).toBeVisible({ timeout: 15000 })

      const { data: slots } = await sb().from('signup_slots').select('start_time').eq('signup_page_id', signupPage.id)
      const days = new Set(slots.map(s => s.start_time.slice(0, 10)))
      expect(days.size).toBeGreaterThanOrEqual(2)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('manually adds a single slot', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Manual Add Page' })
    await createShootType(signupPage.id, { name: 'Manual Shoot' })
    try {
      await goToSignups(page)
      await page.getByText('Manual Add Page').click()
      await expect(page.getByRole('button', { name: /^Manual Shoot/ })).toBeVisible()

      await page.getByText('+ Add a single slot manually').click()
      await page.locator('input[type="date"]').last().fill('2026-09-20')
      await page.getByRole('button', { name: 'Add slot' }).click()
      await expect(page.getByText('+ Add a single slot manually')).toBeVisible({ timeout: 10000 })

      const { data: slots } = await sb().from('signup_slots').select('id').eq('signup_page_id', signupPage.id)
      expect(slots.length).toBe(1)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('clears all open slots without touching claimed ones', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Clear All Page' })
    const shootType = await createShootType(signupPage.id)
    await createSlot(signupPage.id, shootType.id, '2026-09-25T19:00:00Z', '2026-09-25T19:15:00Z')
    await createSlot(signupPage.id, shootType.id, '2026-09-25T19:15:00Z', '2026-09-25T19:30:00Z')
    const claimedSlot = await createSlot(signupPage.id, shootType.id, '2026-09-25T20:00:00Z', '2026-09-25T20:15:00Z', new Date().toISOString())

    try {
      await goToSignups(page)
      await page.getByText('Clear All Page').click()
      await expect(page.getByText('Clear all open slots')).toBeVisible()
      await page.getByText('Clear all open slots').click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(page.getByText('Remove all open slots?')).not.toBeVisible({ timeout: 10000 })

      const { data: remaining } = await sb().from('signup_slots').select('id, claimed_at').eq('signup_page_id', signupPage.id)
      expect(remaining.length).toBe(1)
      expect(remaining[0].id).toBe(claimedSlot.id)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('toggles a page active and inactive', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Toggle Active Page' })
    try {
      await goToSignups(page)
      await page.getByText('Toggle Active Page').click()

      // Scoped to the Toggle component's own <label> (which wraps the
      // checkbox) rather than a bare text match -- once the underlying
      // page list refreshes in the background, the card behind the modal
      // shows the same "Active"/"Inactive" word as its own status badge,
      // creating a genuine second match for an unscoped locator.
      const toggleLabel = page.locator('label').filter({ has: page.getByRole('checkbox') })
      await expect(toggleLabel.getByText('Active', { exact: true })).toBeVisible()

      const checkbox = page.getByRole('checkbox')
      await expect(checkbox).toBeChecked()
      // The real input is visually hidden (sr-only) behind a styled track
      // div -- Playwright's actionability check wants a visibly-actionable
      // target and will hang waiting for one, so force bypasses that
      // check for what's an intentionally hidden-but-functional control.
      await checkbox.click({ force: true })
      await expect(toggleLabel.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 10000 })

      const { data: afterToggleOff } = await sb().from('signup_pages').select('is_active').eq('id', signupPage.id).single()
      expect(afterToggleOff.is_active).toBe(false)

      await checkbox.click({ force: true })
      await expect(toggleLabel.getByText('Active', { exact: true })).toBeVisible({ timeout: 10000 })

      const { data: afterToggleOn } = await sb().from('signup_pages').select('is_active').eq('id', signupPage.id).single()
      expect(afterToggleOn.is_active).toBe(true)
    } finally {
      await cleanupSignupPage(signupPage.id)
    }
  })

  test('linked questionnaire is assigned automatically on booking', async ({ page }) => {
    const signupPage = await createSignupPage({ title: 'Questionnaire Link Page' })
    const shootType = await createShootType(signupPage.id, { name: 'Questionnaire Shoot' })
    const slot = await createSlot(signupPage.id, shootType.id, '2026-09-30T19:00:00Z', '2026-09-30T19:15:00Z')
    const questionnaire = await createQuestionnaireTemplate()
    const email = `questionnaire-link-${crypto.randomUUID().slice(0, 8)}@example.com`

    try {
      await goToSignups(page)
      await page.getByText('Questionnaire Link Page').click()
      await page.getByRole('button', { name: /^Questionnaire Shoot/ }).click()
      await expect(page.getByText('Test Questionnaire', { exact: true })).toBeVisible()
      await page.getByText('Test Questionnaire', { exact: true }).click()
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('button', { name: /^Questionnaire Shoot/ })).toBeVisible({ timeout: 10000 })

      const { data: claimResult, error: claimError } = await sb().rpc('claim_signup_slot', {
        p_slot_id: slot.id, p_first_name: 'Quest', p_last_name: 'Ionnaire', p_email: email,
      })
      expect(claimError, claimError?.message).toBeNull()
      expect(claimResult.success).toBe(true)

      const { data: linked } = await sb().from('session_questionnaires').select('questionnaire_id').eq('session_id', claimResult.session_id)
      expect(linked.map(l => l.questionnaire_id)).toContain(questionnaire.id)

      await sb().from('sessions').delete().eq('id', claimResult.session_id)
      await sb().from('clients').delete().eq('id', claimResult.client_id)
    } finally {
      await cleanupSignupPage(signupPage.id)
      await cleanupQuestionnaire(questionnaire.id)
    }
  })
})
