import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { enterGalleryAsClient, FIXTURE_GALLERY } from '../../fixtures/fixtures.js'

// ── Tier 3 async hi-res ZIP queue ───────────────────────────────────────────
//
// Scope note: these tests cover the FRONTEND threshold-routing decision
// (sync vs. async) and its integration with the real POST /zip-jobs
// endpoint (a real zip_jobs row gets created with the right fields).
// They deliberately do NOT wait for full Workflow completion -- that's
// several minutes of real R2/Workflow processing per run, which was
// already extensively hand-verified against real galleries (including a
// real 160-image gallery) during development. Automating that here would
// make the suite slow and dependent on live Cloudflare infrastructure for
// coverage this suite already has confidence in another way.

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

async function createGallery(overrides = {}) {
  const photographerId = await getPhotographerId()
  const shareToken = `test-zipq-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await sb().from('galleries').insert({
    photographer_id: photographerId,
    title: 'ZIP Queue Test Gallery',
    share_token: shareToken,
    is_active: true,
    allow_downloads: true,
    download_watermarked: true,
    allow_hires_download: true,
    allow_favorites: false,
    allow_comments: false,
    require_download_pin: false,
    show_guide: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

// Inserts `count` gallery_images rows. Reuses the fixture gallery's real R2
// key pattern for realism, but that's incidental here -- these tests only
// need real rows with a file_size for the frontend's threshold math
// (images.length / sum of file_size), not real fetchable R2 objects, since
// they stop short of asserting the ZIP itself gets built.
async function insertImages(gallery, count, fileSizeEach = 500000) {
  const photographerId = await getPhotographerId()
  const rows = []
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID()
    rows.push({
      id,
      gallery_id: gallery.id,
      photographer_id: photographerId,
      file_name: `test-image-${i}.jpg`,
      preview_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/preview/${id}.webp`,
      original_r2_key: `photographers/${photographerId}/galleries/${gallery.id}/original/${id}.jpg`,
      file_size: fileSizeEach,
      preview_size: 200000,
      updated_at: new Date().toISOString(),
    })
  }
  const { error } = await sb().from('gallery_images').insert(rows)
  if (error) throw new Error(error.message)
}

// Mirrors hashImageKeys() in r2-worker/src/handlers/zip-jobs.js EXACTLY --
// same input format (`${size}|${sortedKeys.join(',')}`), same algorithm
// (SHA-256), same hex encoding. Node's crypto.createHash gives identical
// output to the worker's Web Crypto crypto.subtle.digest for the same
// input, since it's the same standard hash function either way -- this
// lets tests seed a zip_jobs row whose image_keys_hash the real endpoint
// will actually recognize as a match, without needing to drive a real
// Workflow run first just to get a 'ready' job to dedupe against.
function computeImageKeysHash(imageKeys, size) {
  const sorted = [...imageKeys].sort()
  const input = `${size}|${sorted.join(',')}`
  return crypto.createHash('sha256').update(input).digest('hex')
}

async function cleanupGallery(galleryId) {
  await sb().from('zip_jobs').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_images').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_viewers').delete().eq('gallery_id', galleryId)
  await sb().from('gallery_activity_log').delete().eq('gallery_id', galleryId)
  await sb().from('galleries').delete().eq('id', galleryId)
}

async function clickHighResDownload(page) {
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  await page.waitForTimeout(500)
  const stickyHeader = page.locator('div.sticky')
  await stickyHeader.waitFor({ state: 'visible', timeout: 10000 })
  await stickyHeader.getByRole('button').last().click()
  await page.getByText(/High Resolution|High Res/).click()
}

async function clickWebSizeDownload(page) {
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }))
  await page.waitForTimeout(500)
  const stickyHeader = page.locator('div.sticky')
  await stickyHeader.waitFor({ state: 'visible', timeout: 10000 })
  await stickyHeader.getByRole('button').last().click()
  await page.getByText('Web Size').click()
}

test.describe.configure({ mode: 'serial' })
test.use({ contextOptions: { storageState: undefined } })

test.describe('Async hi-res ZIP queue — small gallery stays synchronous', () => {
  let gallery

  test.beforeEach(async () => {
    gallery = await createGallery()
    await insertImages(gallery, 3) // well under the 25-image / 250MB threshold
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('under-threshold hi-res download still triggers an instant browser download', async ({ page, browserName, isMobile }) => {
    test.skip(isMobile && browserName === 'webkit', 'iOS uses native share sheet, no download event')
    await enterGalleryAsClient(page, gallery.share_token)
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await clickHighResDownload(page)
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.zip$/i)

    // No async job should have been created for this small gallery
    const { data: jobs } = await sb().from('zip_jobs').select('id').eq('gallery_id', gallery.id)
    expect(jobs).toHaveLength(0)
  })
})

test.describe('Async hi-res ZIP queue — over-threshold gallery queues instead', () => {
  let gallery
  const IMAGE_COUNT = 26 // one over the 25-image threshold

  test.beforeEach(async () => {
    gallery = await createGallery()
    await insertImages(gallery, IMAGE_COUNT)
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('over-threshold hi-res download shows the queued confirmation, not a browser download', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)

    let downloadFired = false
    page.on('download', () => { downloadFired = true })

    await clickHighResDownload(page)

    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/You'll get an email/i)).toBeVisible()

    // Give it a moment to see if a download event fires anyway -- it shouldn't.
    await page.waitForTimeout(1500)
    expect(downloadFired).toBe(false)
  })

  test('over-threshold hi-res download creates a real zip_jobs row via POST /zip-jobs', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await clickHighResDownload(page)
    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })

    // Give the request a moment to land, then verify the real backend
    // actually created the job with the right fields.
    await page.waitForTimeout(1000)
    const { data: jobs } = await sb().from('zip_jobs').select('*').eq('gallery_id', gallery.id)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].image_count).toBe(IMAGE_COUNT)
    expect(jobs[0].notify_email).toBe('testclient@example.com')
    expect(['queued', 'processing', 'ready']).toContain(jobs[0].status)
  })
})

test.describe('Async hi-res ZIP queue — PIN gate', () => {
  let gallery
  const IMAGE_COUNT = 26

  test.beforeEach(async () => {
    gallery = await createGallery({
      require_download_pin: true,
      plain_download_pin: '4821',
    })
    await insertImages(gallery, IMAGE_COUNT)
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('PIN gate appears before an over-threshold hi-res download queues', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await clickHighResDownload(page)
    await expect(page.getByText('Download PIN required')).toBeVisible()

    // No job should exist yet -- the PIN hasn't been submitted
    const { data: jobsBefore } = await sb().from('zip_jobs').select('id').eq('gallery_id', gallery.id)
    expect(jobsBefore).toHaveLength(0)

    await page.locator('input[inputmode="numeric"]').fill('4821')
    await page.getByRole('button', { name: 'Download' }).click()

    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1000)
    const { data: jobsAfter } = await sb().from('zip_jobs').select('id').eq('gallery_id', gallery.id)
    expect(jobsAfter).toHaveLength(1)
  })
})

// ── v1.5.8: async web-size ZIP queue ────────────────────────────────────────
//
// Same threshold, same endpoint, same Workflow as hi-res -- these tests
// mirror the hi-res ones above but confirm the size='web' branch of the
// same code path (queueZip / shouldQueueZip / POST /zip-jobs) works too.

test.describe('Async web-size ZIP queue — over-threshold gallery queues instead', () => {
  let gallery
  const IMAGE_COUNT = 26 // one over the 25-image threshold

  test.beforeEach(async () => {
    gallery = await createGallery()
    await insertImages(gallery, IMAGE_COUNT)
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('over-threshold web-size download shows the queued confirmation, not a browser download', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)

    let downloadFired = false
    page.on('download', () => { downloadFired = true })

    await clickWebSizeDownload(page)

    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/You'll get an email/i)).toBeVisible()

    // Give it a moment to see if a download event fires anyway -- it shouldn't.
    await page.waitForTimeout(1500)
    expect(downloadFired).toBe(false)
  })

  test('over-threshold web-size download creates a real zip_jobs row with size=web', async ({ page }) => {
    await enterGalleryAsClient(page, gallery.share_token)
    await clickWebSizeDownload(page)
    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })

    await page.waitForTimeout(1000)
    const { data: jobs } = await sb().from('zip_jobs').select('*').eq('gallery_id', gallery.id)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].size).toBe('web')
    expect(jobs[0].image_count).toBe(IMAGE_COUNT)
    expect(jobs[0].notify_email).toBe('testclient@example.com')
    expect(['queued', 'processing', 'ready']).toContain(jobs[0].status)
  })
})

// ── v1.5.8: content-based dedup ─────────────────────────────────────────────
//
// Testing this against a REAL Workflow-built job would mean waiting out a
// full multi-minute run just to get something to dedupe against -- exactly
// the cost this suite's scope note above already avoids for hi-res. Instead,
// these seed a completed 'ready' job directly with a hash computed the same
// way the real endpoint computes it (see computeImageKeysHash above), which
// exercises the real dedup LOOKUP-AND-ADOPT logic in POST /zip-jobs without
// needing a real Workflow run first.

test.describe('Async ZIP queue — content-based dedup', () => {
  let gallery
  const IMAGE_COUNT = 26

  test.beforeEach(async () => {
    gallery = await createGallery()
    await insertImages(gallery, IMAGE_COUNT)
  })

  test.afterEach(async () => {
    await cleanupGallery(gallery.id)
  })

  test('identical web-size download adopts an existing ready job instead of running a fresh Workflow', async ({ page }) => {
    const { data: images } = await sb().from('gallery_images').select('original_r2_key').eq('gallery_id', gallery.id)
    const imageKeys = images.map(i => i.original_r2_key)
    const hash = computeImageKeysHash(imageKeys, 'web')

    const { data: sourceJob, error } = await sb().from('zip_jobs').insert({
      gallery_id: gallery.id,
      size: 'web',
      image_count: IMAGE_COUNT,
      images_completed: IMAGE_COUNT,
      image_keys_hash: hash,
      status: 'ready',
      download_r2_key: `zip-jobs/test-dedup-${crypto.randomUUID()}.zip`,
      notify_email: 'someone-else@example.com',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single()
    if (error) throw new Error(error.message)

    await enterGalleryAsClient(page, gallery.share_token)
    await clickWebSizeDownload(page)
    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })

    // Give the request a moment to land, then verify the adopted job.
    await page.waitForTimeout(1500)
    const { data: jobs } = await sb().from('zip_jobs').select('*').eq('gallery_id', gallery.id).order('created_at', { ascending: true })
    expect(jobs).toHaveLength(2)

    const adoptedJob = jobs.find(j => j.id !== sourceJob.id)
    expect(adoptedJob).toBeTruthy()
    expect(adoptedJob.dedup_source_job_id).toBe(sourceJob.id)
    expect(adoptedJob.status).toBe('ready')
    expect(adoptedJob.download_r2_key).toBe(sourceJob.download_r2_key)
    // Capped at the SOURCE job's real expiry, not a fresh 7 days from now
    expect(new Date(adoptedJob.expires_at).getTime()).toBe(new Date(sourceJob.expires_at).getTime())
  })

  test('a different image selection does NOT dedupe against an unrelated ready job', async ({ page }) => {
    // Seed a ready job for a hash that does NOT match this gallery's real
    // image keys -- confirms the lookup is a genuine hash match, not just
    // "any ready job on this gallery+size".
    const bogusHash = computeImageKeysHash(['not/a/real/key.jpg'], 'web')
    await sb().from('zip_jobs').insert({
      gallery_id: gallery.id,
      size: 'web',
      image_count: 1,
      images_completed: 1,
      image_keys_hash: bogusHash,
      status: 'ready',
      download_r2_key: `zip-jobs/test-unrelated-${crypto.randomUUID()}.zip`,
      notify_email: 'someone-else@example.com',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    })

    await enterGalleryAsClient(page, gallery.share_token)
    await clickWebSizeDownload(page)
    await expect(page.getByText(/preparing your download/i)).toBeVisible({ timeout: 10000 })

    await page.waitForTimeout(1500)
    const { data: jobs } = await sb().from('zip_jobs').select('*').eq('gallery_id', gallery.id)
    expect(jobs).toHaveLength(2) // the seeded unrelated job + a real new one
    const newJob = jobs.find(j => j.notify_email === 'testclient@example.com')
    expect(newJob).toBeTruthy()
    expect(newJob.dedup_source_job_id).toBeNull()
  })
})
