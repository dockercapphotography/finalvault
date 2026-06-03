import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

export { expect }

// ── Supabase admin client ─────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Fixture gallery — pre-seeded with real images in R2 ───────────────────────
// Created manually by logging in as playwright@finalvault.test and uploading
// 3 test images. These R2 keys are stable and reused across all image-dependent tests.

export const FIXTURE_GALLERY = {
  id: 'f323f9bc-5305-4a82-86f2-eb71a3713050',
  shareToken: '85612f504a33489498ce6dc446562c16',
  title: 'Fixture Gallery',
  setId: '8ea244d5-4ac2-4a1a-b727-cb8f921419b0',
  images: [
    {
      id: 'cdde6fa5-cd3d-4fc6-82aa-9b34fd3f8bc8',
      fileName: 'Fallout_Export-8.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/preview/cdde6fa5-cd3d-4fc6-82aa-9b34fd3f8bc8.webp',
      originalR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/original/cdde6fa5-cd3d-4fc6-82aa-9b34fd3f8bc8.jpg',
    },
    {
      id: 'e24ffd52-0f7b-49b2-b780-5af5b5957461',
      fileName: 'BlackManta-Jokerv2.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/preview/e24ffd52-0f7b-49b2-b780-5af5b5957461.webp',
      originalR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/original/e24ffd52-0f7b-49b2-b780-5af5b5957461.jpg',
    },
    {
      id: 'd96b3219-9335-4bec-8025-012303a97de5',
      fileName: 'PhoenixWright-GenCon-4.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/preview/d96b3219-9335-4bec-8025-012303a97de5.webp',
      originalR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/f323f9bc-5305-4a82-86f2-eb71a3713050/original/d96b3219-9335-4bec-8025-012303a97de5.jpg',
    },
  ],
}


export const COMMENTS_FIXTURE_GALLERY = {
  id: 'b7d4ebdb-4908-4a2a-98ac-913484539dab',
  shareToken: '1c3a907d1bec493184790c93ce6507fc',
  title: 'Comments Fixture Gallery',
  setId: 'bc815a41-9a3c-405e-bd7e-37b15ad88de6',
  images: [
    {
      id: '97c59468-4a88-44fa-9412-ac0e156bfcc9',
      fileName: 'Fallout_Export-8.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/b7d4ebdb-4908-4a2a-98ac-913484539dab/preview/97c59468-4a88-44fa-9412-ac0e156bfcc9.webp',
    },
    {
      id: '9d7289c9-0821-46e0-bce1-8985273f8376',
      fileName: 'BlackManta-Jokerv2.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/b7d4ebdb-4908-4a2a-98ac-913484539dab/preview/9d7289c9-0821-46e0-bce1-8985273f8376.webp',
    },
    {
      id: '2b927bab-c66b-4e6c-a893-8a3bf852dbdc',
      fileName: 'PhoenixWright-GenCon-4.jpg',
      previewR2Key: 'photographers/6935045c-38c1-498d-b0d6-3abbb4fff2a4/galleries/b7d4ebdb-4908-4a2a-98ac-913484539dab/preview/2b927bab-c66b-4e6c-a893-8a3bf852dbdc.webp',
    },
  ],
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

export const test = base.extend({
  // Photographer page — pre-authenticated via saved storage state
  page: async ({ browser }, use) => {
    const ctx = await browser.newContext({
      storageState: 'tests/.auth/photographer.json',
    })
    const page = await ctx.newPage()
    await use(page)
    await ctx.close()
  },

  // Supabase admin client available directly in tests
  sb: async ({}, use) => {
    await use(adminClient())
  },

  // Creates a fresh gallery for the test, then deletes it after.
  testGallery: async ({}, use) => {
    const sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error('Test photographer user not found in Supabase')

    const shareToken = `pw-test-${crypto.randomUUID().slice(0, 8)}`
    const { data: gallery, error } = await sb.from('galleries').insert({
      photographer_id: user.id,
      title: 'Playwright Test Gallery',
      client_name: 'Test Client',
      share_token: shareToken,
      is_active: true,
      allow_downloads: true,
      download_watermarked: true,
      allow_hires_download: false,
      allow_favorites: true,
      allow_comments: true,
      require_password: false,
      require_download_pin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    if (error) throw new Error(`Could not create test gallery: ${error.message}`)

    await use({ galleryId: gallery.id, shareToken: gallery.share_token, photographerId: user.id })

    await sb.from('gallery_images').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb.from('galleries').delete().eq('id', gallery.id)
  },

  // Like testGallery but with password protection enabled
  testGalleryWithPassword: async ({}, use) => {
    const sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error('Test photographer user not found in Supabase')

    const shareToken = `pw-test-${crypto.randomUUID().slice(0, 8)}`
    const password = 'testpass123'

    const { data: gallery, error } = await sb.from('galleries').insert({
      photographer_id: user.id,
      title: 'Password Protected Gallery',
      share_token: shareToken,
      is_active: true,
      require_password: true,
      plain_password: password,
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    if (error) throw new Error(`Could not create password gallery: ${error.message}`)

    await use({ galleryId: gallery.id, shareToken, password })

    await sb.from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb.from('galleries').delete().eq('id', gallery.id)
  },

  // Like testGallery but with download PIN enabled
  testGalleryWithPin: async ({}, use) => {
    const sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error('Test photographer user not found in Supabase')

    const shareToken = `pw-test-${crypto.randomUUID().slice(0, 8)}`
    const pin = '7391'

    const { data: gallery, error } = await sb.from('galleries').insert({
      photographer_id: user.id,
      title: 'PIN Protected Gallery',
      share_token: shareToken,
      is_active: true,
      require_password: false,
      require_download_pin: true,
      plain_download_pin: pin,
      allow_downloads: true,
      download_watermarked: true,
      allow_hires_download: false,
      allow_favorites: true,
      allow_comments: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    if (error) throw new Error(`Could not create PIN gallery: ${error.message}`)

    await use({ galleryId: gallery.id, shareToken, pin })

    await sb.from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb.from('galleries').delete().eq('id', gallery.id)
  },

  // Like testGallery but with allow_proofing enabled (requires allow_favorites: true)
  testGalleryWithProofing: async ({}, use) => {
    const sb = adminClient()
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!user) throw new Error('Test photographer user not found in Supabase')

    const shareToken = `pw-test-${crypto.randomUUID().slice(0, 8)}`
    const { data: gallery, error } = await sb.from('galleries').insert({
      photographer_id: user.id,
      title: 'Proofing Test Gallery',
      client_name: 'Test Client',
      share_token: shareToken,
      is_active: true,
      allow_downloads: false,
      allow_favorites: true,
      allow_comments: false,
      allow_proofing: true,
      require_password: false,
      require_download_pin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single()

    if (error) throw new Error(`Could not create proofing gallery: ${error.message}`)

    await use({ galleryId: gallery.id, shareToken: gallery.share_token, photographerId: user.id })

    await sb.from('gallery_selections').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_favorites').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_viewers').delete().eq('gallery_id', gallery.id)
    await sb.from('gallery_activity_log').delete().eq('gallery_id', gallery.id)
    await sb.from('galleries').delete().eq('id', gallery.id)
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function enterGalleryAsClient(page, shareToken, email = 'testclient@example.com') {
  await page.goto(`/g/${shareToken}`)
  await expect(page.locator('.animate-spin')).not.toBeAttached({ timeout: 15000 })
  await page.getByPlaceholder('Enter your email to continue').fill(email)
  await page.getByRole('button', { name: 'View Gallery' }).click()
  await expect(page).toHaveURL(`/g/${shareToken}/view`, { timeout: 10000 })
}

// Enter the fixture gallery as a client, cleaning up the viewer session after
export async function enterFixtureGallery(page, email = 'testclient@example.com') {
  await enterGalleryAsClient(page, FIXTURE_GALLERY.shareToken, email)
}

// Creates a viewer and submits a gallery_selection record directly via Supabase.
// Use this in photographer-side tests that need a pre-existing submission to inspect.
export async function submitTestSelection(galleryId, {
  viewerName = 'Test Client',
  viewerEmail = 'testclient@example.com',
  imageIds = [],
  note = null,
} = {}) {
  const sb = adminClient()

  // Create or reuse a viewer record
  const { data: viewer, error: viewerErr } = await sb
    .from('gallery_viewers')
    .insert({
      gallery_id: galleryId,
      display_name: viewerName,
      email: viewerEmail,
      session_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (viewerErr) throw new Error(`Could not create test viewer: ${viewerErr.message}`)

  // Upsert the selection record
  const { data: selection, error: selErr } = await sb
    .from('gallery_selections')
    .upsert({
      gallery_id: galleryId,
      viewer_id: viewer.id,
      image_ids: imageIds,
      image_count: imageIds.length,
      viewer_name: viewerName,
      viewer_email: viewerEmail,
      note: note,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'gallery_id,viewer_id' })
    .select()
    .single()

  if (selErr) throw new Error(`Could not create test selection: ${selErr.message}`)

  // Log the activity entry
  await sb.from('gallery_activity_log').insert({
    gallery_id: galleryId,
    viewer_id: viewer.id,
    action: 'selection_submitted',
    occurred_at: new Date().toISOString(),
  })

  return { viewer, selection, viewerName, viewerEmail, imageCount: imageIds.length }
}
