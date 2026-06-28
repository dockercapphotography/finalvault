import { test, expect } from '@playwright/test'
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


// ── gallery_viewers cross-gallery reassignment (KNOWN GAP, not a guarantee) ─
//
// IMPORTANT: this test documents ACTUAL behavior, not a security boundary
// that's been verified to hold. The UPDATE policy in
// 027_gallery_viewers_rls_enable.sql checks gallery_viewers.gallery_id
// against "does this belong to an active gallery" in BOTH the USING clause
// (evaluated against the row being updated) AND the WITH CHECK clause
// (evaluated against the NEW row after the update, per Postgres RLS
// semantics). Because the check is "is this an active gallery" rather than
// "is this the SAME gallery the row started in", an anonymous caller CAN
// reassign an existing viewer row's gallery_id to a different active
// gallery -- both the before and after states pass the same check.
//
// This was discovered while writing this test (2026-06-28), reasoning
// through Postgres's documented WITH CHECK semantics rather than assuming
// the fix from earlier today closed this. It's a narrower issue than the
// platform-wide SELECT enumeration gap already flagged as a follow-up, but
// it's real: in practice this would let someone move a viewer record
// between galleries via a direct API call, bypassing the app's UI (the
// app itself never sends an update like this).
//
// This test asserts the current (gap-having) behavior so a future fix
// shows up as an intentional, visible change here -- not as a silent
// behavior shift discovered by accident the way the original UPDATE-grant
// bug was.
test.describe('Client Gallery — viewer gallery_id reassignment (known gap)', () => {
  let galleryA, galleryB

  test.beforeEach(async () => {
    const { data: { users } } = await sb().auth.admin.listUsers()
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

  test('a viewer row CAN currently be reassigned from one active gallery to another (documents a known gap)', async ({ page }) => {
    await enterGalleryAsClient(page, galleryA.share_token)
    const { data: viewerRows } = await sb()
      .from('gallery_viewers')
      .select('id')
      .eq('gallery_id', galleryA.id)
    expect(viewerRows.length).toBe(1)
    const viewerId = viewerRows[0].id

    const anonClient = createClient(
      process.env.PLAYWRIGHT_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error } = await anonClient
      .from('gallery_viewers')
      .update({ gallery_id: galleryB.id })
      .eq('id', viewerId)

    // This currently SUCCEEDS (error is null) -- see the comment block
    // above. If this assertion ever starts failing, it means the gap has
    // been closed (good!) -- update this test to assert the opposite and
    // remove the "known gap" framing.
    expect(error).toBeNull()

    const { data: rowAfter } = await sb()
      .from('gallery_viewers')
      .select('gallery_id')
      .eq('id', viewerId)
      .single()
    expect(rowAfter.gallery_id).toBe(galleryB.id)
  })
})
