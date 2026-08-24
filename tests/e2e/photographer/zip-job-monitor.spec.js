import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: 'tests/.auth/photographer.json' })
test.describe.configure({ mode: 'serial' })

// Every test searches by this gallery's own unique title before asserting
// anything -- the monitor shows jobs across the WHOLE account, not just
// one gallery, so without scoping, tests here would be flaky against
// zip_jobs created concurrently by other spec files (e.g. zip-queue.spec.js
// running in a parallel worker).

async function getPhotographerId() {
  const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

async function createTestGallery() {
  const photographerId = await getPhotographerId()
  const uid = crypto.randomUUID().slice(0, 8)
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: `PW Monitor Gallery ${uid}`,
    share_token: `pw-monitor-${uid}`,
    is_active: true,
    updated_at: new Date().toISOString(),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function seedZipJob(galleryId, overrides = {}) {
  const { data, error } = await sb().from('zip_jobs').insert({
    gallery_id: galleryId,
    size: 'hires',
    image_count: 10,
    images_completed: 10,
    status: 'ready',
    download_r2_key: `zip-jobs/pw-monitor-${crypto.randomUUID()}.zip`,
    notify_email: 'monitor-test@example.com',
    final_size_bytes: 12345678,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function cleanupGallery(galleryId) {
  await sb().from('zip_jobs').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

// Navigates to Maintenance and searches for this gallery specifically --
// the shared entry point every test below uses for isolation.
async function goToMaintenanceFor(page, galleryTitle) {
  await page.goto('/account?tab=maintenance')
  await expect(page.getByText('Zip job monitor')).toBeVisible({ timeout: 10000 })
  await page.getByPlaceholder('Search by gallery').fill(galleryTitle)
  await expect(page.getByText(galleryTitle).first()).toBeVisible({ timeout: 10000 })
}

test.describe('Zip Job Monitor', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createTestGallery()
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('shows a seeded ready job with its gallery name and status', async ({ page }) => {
    await seedZipJob(gallery.id)
    await goToMaintenanceFor(page, gallery.title)
    await expect(page.getByText('Ready').first()).toBeVisible()
  })

  test('shows the real file size when final_size_bytes is set', async ({ page }) => {
    await seedZipJob(gallery.id, { final_size_bytes: 5242880 }) // 5MB
    await goToMaintenanceFor(page, gallery.title)
    await expect(page.getByText('5.0 MB')).toBeVisible()
  })

  test('shows a Cache hit badge for a dedup-adopted job, Workflow for a normal one', async ({ page }) => {
    const source = await seedZipJob(gallery.id)
    await seedZipJob(gallery.id, { dedup_source_job_id: source.id, download_r2_key: source.download_r2_key })
    await goToMaintenanceFor(page, gallery.title)
    // Scoped to the table specifically -- the section's own description
    // text ("...whether a job was a fresh build or a dedup cache hit.")
    // contains "cache hit" as a substring, which getByText's default
    // case-insensitive matching would otherwise also match.
    const table = page.getByRole('table')
    await expect(table.getByText('Cache hit')).toBeVisible()
    await expect(table.getByText('Workflow')).toBeVisible()
  })

  test('status filter narrows the list', async ({ page }) => {
    await seedZipJob(gallery.id, { status: 'ready' })
    await goToMaintenanceFor(page, gallery.title)
    await page.getByLabel('Filter by status').selectOption('failed')
    await expect(page.getByText(gallery.title)).not.toBeVisible()
    await page.getByLabel('Filter by status').selectOption('ready')
    await expect(page.getByText(gallery.title)).toBeVisible({ timeout: 5000 })
  })

  test('size filter narrows the list', async ({ page }) => {
    await seedZipJob(gallery.id, { size: 'web' })
    await goToMaintenanceFor(page, gallery.title)
    await page.getByLabel('Filter by size').selectOption('hires')
    await expect(page.getByText(gallery.title)).not.toBeVisible()
    await page.getByLabel('Filter by size').selectOption('web')
    await expect(page.getByText(gallery.title)).toBeVisible({ timeout: 5000 })
  })

  test('search with no matches shows the empty-filters message', async ({ page }) => {
    await seedZipJob(gallery.id)
    await page.goto('/account?tab=maintenance')
    await expect(page.getByText('Zip job monitor')).toBeVisible({ timeout: 10000 })
    await page.getByPlaceholder('Search by gallery').fill('a gallery that definitely does not exist xyz123')
    await expect(page.getByText('No jobs match these filters.')).toBeVisible({ timeout: 5000 })
  })

  test('expire opens a real confirm dialog (not inline) and marks the job expired', async ({ page }) => {
    const job = await seedZipJob(gallery.id)
    await goToMaintenanceFor(page, gallery.title)

    await page.getByRole('button', { name: 'Expire' }).first().click()
    await expect(page.getByText('Expire this download?')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Expire download/ }).click()

    await expect(page.getByText('Expire this download?')).not.toBeVisible({ timeout: 10000 })
    const { data: refetched } = await sb().from('zip_jobs').select('status').eq('id', job.id).single()
    expect(refetched.status).toBe('expired')
  })

  test('expiring one job also expires any sibling sharing the same R2 file', async ({ page }) => {
    const source = await seedZipJob(gallery.id)
    const sibling = await seedZipJob(gallery.id, { dedup_source_job_id: source.id, download_r2_key: source.download_r2_key })
    await goToMaintenanceFor(page, gallery.title)

    await page.getByRole('button', { name: 'Expire' }).first().click()
    await expect(page.getByText('Expire this download?')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Expire download/ }).click()
    await expect(page.getByText('Expire this download?')).not.toBeVisible({ timeout: 10000 })

    const { data: rows } = await sb().from('zip_jobs').select('status').in('id', [source.id, sibling.id])
    expect(rows.every(r => r.status === 'expired')).toBe(true)
  })

  test('cancelling the expire confirm leaves the job untouched', async ({ page }) => {
    const job = await seedZipJob(gallery.id)
    await goToMaintenanceFor(page, gallery.title)

    await page.getByRole('button', { name: 'Expire' }).first().click()
    await expect(page.getByText('Expire this download?')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Expire this download?')).not.toBeVisible({ timeout: 5000 })

    const { data: refetched } = await sb().from('zip_jobs').select('status').eq('id', job.id).single()
    expect(refetched.status).toBe('ready')
  })

  test('a failed job shows its error message', async ({ page }) => {
    await seedZipJob(gallery.id, {
      status: 'failed',
      download_r2_key: null,
      completed_at: null,
      error_message: 'PW test failure message',
    })
    await goToMaintenanceFor(page, gallery.title)
    await expect(page.getByText('PW test failure message')).toBeVisible({ timeout: 5000 })
    // No Expire button on a failed job -- only 'ready' jobs have a real
    // file to expire.
    await expect(page.getByRole('button', { name: 'Expire' })).not.toBeVisible()
  })
})

test.describe('Zip Job Monitor — pagination', () => {
  let gallery
  const JOB_COUNT = 12 // more than the 10/page default, less than a 2nd full page

  test.beforeEach(async () => {
    gallery = await createTestGallery()
    for (let i = 0; i < JOB_COUNT; i++) {
      await seedZipJob(gallery.id)
    }
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('defaults to 10 per page and shows a real page count', async ({ page }) => {
    await goToMaintenanceFor(page, gallery.title)
    await expect(page.getByText(`Showing 1–10 of ${JOB_COUNT}`)).toBeVisible()
    await expect(page.getByText('Page 1 of 2')).toBeVisible()
  })

  test('Next advances to the second page and shows the remainder', async ({ page }) => {
    await goToMaintenanceFor(page, gallery.title)
    await expect(page.getByText('Page 1 of 2')).toBeVisible()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText(`Showing 11–${JOB_COUNT} of ${JOB_COUNT}`)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Page 2 of 2')).toBeVisible()
  })

  test('raising rows-per-page to 100 fits everything on one page', async ({ page }) => {
    await goToMaintenanceFor(page, gallery.title)
    await page.getByLabel('Rows per page').selectOption('100')
    await expect(page.getByText(`Showing 1–${JOB_COUNT} of ${JOB_COUNT}`)).toBeVisible({ timeout: 5000 })
    // Only one page now -- the "Page X of Y" label is hidden entirely
    // when there's nothing to page through (see PaginationFooter).
    await expect(page.getByText(/Page \d+ of \d+/)).not.toBeVisible()
  })
})
