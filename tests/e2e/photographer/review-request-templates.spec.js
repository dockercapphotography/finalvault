import { test, expect } from '../../fixtures/fixtures.js'
import { adminClient, getTestPhotographerId } from '../../fixtures/reviews.js'

/**
 * Account -> Templates -> Review Request Templates (v1.5.17), and
 * TemplateEditorModal's "Insert variable" going to the cursor.
 *
 * Templates made here are prefixed "PW " and deleted afterwards. The
 * star changes which template is the default, so the photographer's
 * original default is restored after every test.
 */

let sb
let photographerId
let originalDefaultId

test.beforeAll(async () => {
  sb = adminClient()
  photographerId = await getTestPhotographerId(sb)
  const { data } = await sb.from('review_request_templates')
    .select('id').eq('photographer_id', photographerId).eq('is_default', true).maybeSingle()
  originalDefaultId = data?.id ?? null
})

test.afterEach(async () => {
  await sb.from('review_request_templates').delete()
    .eq('photographer_id', photographerId).like('name', 'PW %')
  // Two steps, like set_default_review_request_template: clear, then set,
  // so the one-default unique index never sees two at once.
  await sb.from('review_request_templates').update({ is_default: false })
    .eq('photographer_id', photographerId).eq('is_default', true)
  if (originalDefaultId) {
    await sb.from('review_request_templates').update({ is_default: true }).eq('id', originalDefaultId)
  }
})

function reviewSection(page) {
  return page.locator('div.rounded-xl.overflow-hidden', {
    has: page.getByRole('heading', { name: 'Review Request Templates', level: 3 }),
  })
}

async function openTemplates(page) {
  await page.goto('/account?tab=templates')
  await expect(reviewSection(page)).toBeVisible({ timeout: 10000 })
}

async function makeTemplate(name) {
  const { data, error } = await sb.from('review_request_templates').insert({
    photographer_id: photographerId, name, subject: 'Subject', body: 'Body',
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function defaultTemplateId() {
  const { data } = await sb.from('review_request_templates')
    .select('id').eq('photographer_id', photographerId).eq('is_default', true).maybeSingle()
  return data?.id ?? null
}

// Not exact: once a template is the default, its name <p> also holds the
// "Default" pill, so its full text is "<name>Default".
function row(page, name) {
  return reviewSection(page).getByText(name).locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
}

test.describe('Review Request Templates', () => {
  test('New Template creates a template with name, subject, and message', async ({ page }) => {
    const name = `PW Create ${crypto.randomUUID().slice(0, 8)}`
    await openTemplates(page)
    await reviewSection(page).getByRole('button', { name: 'New Template' }).click()
    await expect(page.getByRole('heading', { name: 'New Review Request Template' })).toBeVisible()

    await page.getByPlaceholder('e.g. After-session thank you').fill(name)
    await page.getByPlaceholder('How was your session, {{client_first_name}}?').fill('Quick question')
    await page.getByPlaceholder(/^Hi \{\{client_first_name\}\},/).fill('Hello there')
    await page.getByRole('button', { name: 'Save Template' }).click()

    await expect(reviewSection(page).getByText(name, { exact: true })).toBeVisible({ timeout: 10000 })
    const { data } = await sb.from('review_request_templates').select('subject, body').eq('name', name).single()
    expect(data.subject).toBe('Quick question')
    expect(data.body).toBe('Hello there')
  })

  test('the star sets the default, moves it, and clears it', async ({ page }) => {
    const a = await makeTemplate(`PW Star A ${crypto.randomUUID().slice(0, 8)}`)
    const b = await makeTemplate(`PW Star B ${crypto.randomUUID().slice(0, 8)}`)
    await openTemplates(page)

    await row(page, a.name).getByTitle('Set as default').click()
    await expect(row(page, a.name).getByText('Default', { exact: true })).toBeVisible()
    await expect.poll(defaultTemplateId).toBe(a.id)

    await row(page, b.name).getByTitle('Set as default').click()
    await expect(row(page, b.name).getByText('Default', { exact: true })).toBeVisible()
    await expect(row(page, a.name).getByText('Default', { exact: true })).toHaveCount(0)
    await expect.poll(defaultTemplateId).toBe(b.id)

    await row(page, b.name).getByTitle(/Default template/).click()
    await expect(row(page, b.name).getByText('Default', { exact: true })).toHaveCount(0)
    await expect.poll(defaultTemplateId).toBeNull()
  })
})

test.describe('Insert variable goes to the cursor', () => {
  test('lands at the caret in Subject; with Template Name focused it goes to the message', async ({ page }) => {
    const name = `PW Caret ${crypto.randomUUID().slice(0, 8)}`
    await openTemplates(page)
    await reviewSection(page).getByRole('button', { name: 'New Template' }).click()

    const subject = page.getByPlaceholder('How was your session, {{client_first_name}}?')
    await subject.fill('Hi there')
    await subject.click()
    await subject.press('End')
    for (let i = 0; i < 'there'.length; i++) await subject.press('ArrowLeft')
    await page.getByRole('button', { name: '{{client_first_name}}', exact: true }).click()
    await expect(subject).toHaveValue('Hi {{client_first_name}}there')

    const nameInput = page.getByPlaceholder('e.g. After-session thank you')
    await nameInput.fill(name)
    await nameInput.click()
    await page.getByRole('button', { name: '{{studio_name}}', exact: true }).click()
    await expect(nameInput).toHaveValue(name)

    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(reviewSection(page).getByText(name, { exact: true })).toBeVisible({ timeout: 10000 })
    const { data } = await sb.from('review_request_templates').select('subject, body').eq('name', name).single()
    expect(data.subject).toBe('Hi {{client_first_name}}there')
    expect(data.body).toContain('{{studio_name}}')
  })
})
