import { test, expect } from '../../fixtures/base.js'
import { createClient } from '@supabase/supabase-js'
import { enterGalleryAsClient } from '../../fixtures/fixtures.js'

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.describe.configure({ mode: 'serial' })

test.use({ contextOptions: { storageState: undefined } })

// ── gallery_viewers UPDATE grant (2026-06-28) ───────────────────────────────
//
// While verifying 027_gallery_viewers_rls_enable.sql, we discovered `anon`
// had never had UPDATE grant on this table -- fixed via a direct GRANT.
// A test was attempted to exercise getOrCreateViewer()'s UPDATE branch
// (last_seen_at bump for a returning visitor), but tracing the actual page
// flow in ClientGallery.jsx showed that branch isn't reachable from a
// normal repeat visit -- the page checks getViewerFromSession() first
// (a synchronous localStorage read, no network call) and only calls
// getOrCreateViewer() for brand-new visitors going through the email gate.
// last_seen_at is therefore not updated on a typical return visit today,
// independent of anything in this migration -- a pre-existing product
// characteristic, not a regression, and not currently worth testing for
// since nothing in the app surfaces or depends on that timestamp.
//
// The UPDATE grant fix itself remains correct and is exercised indirectly:
// nothing in the app currently calls that code path, so there's no
// automated coverage for it either way at the moment.


// ── gallery_viewers lockdown (sql/101 + sql/102, 2026-10-25) ───────────────
//
// Until 102, anon policies let anyone with the public key list every viewer
// (name + email) in any active gallery and move a viewer row between
// galleries (documented here as a known gap since 2026-06-28). Client
// galleries now go through SECURITY DEFINER functions keyed by the
// visitor's own viewer_id, and anon has no direct access to the table.
// These tests pin that down so a policy re-added later shows up here.
test.describe('Client Gallery — viewer rows are not reachable directly', () => {
  let galleryA, galleryB

  const anon = () => createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  test.beforeEach(async () => {
    const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
    const photographer = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!photographer) throw new Error('Test photographer not found')

    const make = async (suffix) => {
      const { data, error } = await sb().from('galleries').insert({
        photographer_id: photographer.id,
        title: `PW Viewer Reassign ${suffix}`,
        share_token: `pw-viewer-reassign-${suffix}-${crypto.randomUUID().slice(0, 8)}`,
        is_active: true,
        allow_downloads: false,
        allow_favorites: true,
        allow_comments: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()
      if (error) throw new Error(error.message)
      return data
    }
    galleryA = await make('a')
    galleryB = await make('b')
  })

  test.afterEach(async () => {
    await sb().from('gallery_viewers').delete().in('gallery_id', [galleryA.id, galleryB.id])
    await sb().from('gallery_activity_log').delete().in('gallery_id', [galleryA.id, galleryB.id])
    await sb().from('galleries').delete().in('id', [galleryA.id, galleryB.id])
  })

  test('a viewer row cannot be listed or moved to another gallery with the public key', async ({ page }) => {
    await enterGalleryAsClient(page, galleryA.share_token)
    const { data: viewerRows } = await sb()
      .from('gallery_viewers')
      .select('id')
      .eq('gallery_id', galleryA.id)
    expect(viewerRows.length).toBe(1)
    const viewerId = viewerRows[0].id

    // Listing: no anon SELECT policy, so nothing comes back.
    const { data: listed } = await anon()
      .from('gallery_viewers')
      .select('id, email')
      .eq('gallery_id', galleryA.id)
    expect(listed ?? []).toHaveLength(0)

    // Reassignment: no anon UPDATE policy, so the update matches no rows.
    await anon()
      .from('gallery_viewers')
      .update({ gallery_id: galleryB.id })
      .eq('id', viewerId)

    const { data: rowAfter } = await sb()
      .from('gallery_viewers')
      .select('gallery_id')
      .eq('id', viewerId)
      .single()
    expect(rowAfter.gallery_id).toBe(galleryA.id)
  })

  test('the old gallery-id viewer function is closed to the public key', async () => {
    const { error } = await anon().rpc('get_or_create_gallery_viewer', {
      p_gallery_id: galleryA.id,
      p_email: 'pw-probe@finalvault.test',
    })
    expect(error).not.toBeNull()
    const { data: rows } = await sb().from('gallery_viewers').select('id').eq('gallery_id', galleryA.id)
    expect(rows).toHaveLength(0)
  })

  test('activity cannot be inserted directly with the public key', async () => {
    const { error } = await anon()
      .from('gallery_activity_log')
      .insert({ gallery_id: galleryA.id, action: 'download_all' })
    expect(error).not.toBeNull()
  })
})
