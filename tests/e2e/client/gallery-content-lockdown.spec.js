import { test, expect } from '../../fixtures/base.js'
import { createClient } from '@supabase/supabase-js'

// ── Gallery photo lockdown (sql/103 + sql/104, 2026-10-25) ──────────────────
//
// Until 104, the public key could list every gallery's photos (file names
// and storage keys), sets and watermarks -- password-protected, inactive and
// expired galleries included -- and a gallery's password was only checked in
// the browser. Client galleries now load through get_client_gallery_content,
// which requires an open gallery and the correct password. These tests pin
// that down so a policy re-added later shows up here.

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function anon() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.describe.configure({ mode: 'serial' })

test.use({ contextOptions: { storageState: undefined } })

test.describe('Client Gallery — photos are not reachable without the gallery link and password', () => {
  let openGallery, pwGallery

  test.beforeAll(async () => {
    const { data: { users } } = await sb().auth.admin.listUsers({ perPage: 1000 })
    const photographer = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    if (!photographer) throw new Error('Test photographer not found')

    const make = async (suffix, extra = {}) => {
      const { data: gallery, error } = await sb().from('galleries').insert({
        photographer_id: photographer.id,
        title: `PW Content Lockdown ${suffix}`,
        share_token: `pw-content-lockdown-${suffix}-${crypto.randomUUID().slice(0, 8)}`,
        is_active: true,
        allow_downloads: false,
        allow_favorites: false,
        allow_comments: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...extra,
      }).select().single()
      if (error) throw new Error(error.message)
      const key = `photographers/${photographer.id}/galleries/${gallery.id}`
      const { error: imgErr } = await sb().from('gallery_images').insert({
        gallery_id: gallery.id,
        photographer_id: photographer.id,
        original_r2_key: `${key}/original/lockdown-probe.jpg`,
        preview_r2_key: `${key}/preview/lockdown-probe.webp`,
        file_name: `lockdown-probe-${suffix}.jpg`,
        sort_order: 1,
      })
      if (imgErr) throw new Error(imgErr.message)
      const { error: setErr } = await sb().from('gallery_sets').insert({
        gallery_id: gallery.id, name: `Lockdown set ${suffix}`, sort_order: 1, created_at: new Date().toISOString(),
      })
      if (setErr) throw new Error(setErr.message)
      return gallery
    }
    openGallery = await make('open')
    pwGallery = await make('pw', { require_password: true, plain_password: 'lockdown-secret' })
  })

  test.afterAll(async () => {
    const ids = [openGallery?.id, pwGallery?.id].filter(Boolean)
    await sb().from('gallery_images').delete().in('gallery_id', ids)
    await sb().from('gallery_sets').delete().in('gallery_id', ids)
    await sb().from('galleries').delete().in('id', ids)
  })

  test('the public key cannot list photos, sets or watermarks directly', async () => {
    const { data: imgs } = await anon().from('gallery_images').select('id, file_name').in('gallery_id', [openGallery.id, pwGallery.id])
    expect(imgs ?? []).toHaveLength(0)
    const { data: sets } = await anon().from('gallery_sets').select('id').in('gallery_id', [openGallery.id, pwGallery.id])
    expect(sets ?? []).toHaveLength(0)
    const { data: wms } = await anon().from('watermarks').select('id').limit(1)
    expect(wms ?? []).toHaveLength(0)
    const { data: galleries } = await anon().from('galleries').select('id').in('id', [openGallery.id, pwGallery.id])
    expect(galleries ?? []).toHaveLength(0)
  })

  test('an open gallery returns its photos and sets with just its link', async () => {
    const { data, error } = await anon().rpc('get_client_gallery_content', { p_token: openGallery.share_token })
    expect(error).toBeNull()
    expect(data.images.map(i => i.file_name)).toEqual(['lockdown-probe-open.jpg'])
    expect(data.sets.map(s => s.name)).toEqual(['Lockdown set open'])
  })

  test('a password gallery returns nothing without the right password', async () => {
    const none = await anon().rpc('get_client_gallery_content', { p_token: pwGallery.share_token })
    expect(none.data).toEqual({ password_required: true })
    const wrong = await anon().rpc('get_client_gallery_content', { p_token: pwGallery.share_token, p_password: 'nope' })
    expect(wrong.data).toEqual({ password_required: true })
    const right = await anon().rpc('get_client_gallery_content', { p_token: pwGallery.share_token, p_password: 'lockdown-secret' })
    expect(right.data.images.map(i => i.file_name)).toEqual(['lockdown-probe-pw.jpg'])
  })

  test('an inactive gallery returns nothing even with its link', async () => {
    await sb().from('galleries').update({ is_active: false }).eq('id', openGallery.id)
    try {
      const { data } = await anon().rpc('get_client_gallery_content', { p_token: openGallery.share_token })
      expect(data).toBeNull()
    } finally {
      await sb().from('galleries').update({ is_active: true }).eq('id', openGallery.id)
    }
  })

  test('?preview=1 without being logged in shows no photos of a password gallery', async ({ page }) => {
    await page.goto(`/g/${pwGallery.share_token}?preview=1`)
    await expect(page.getByText('Preview Mode')).toBeVisible({ timeout: 10000 })
    await page.waitForLoadState('networkidle')
    await expect(page.locator('img[src*="lockdown-probe"]')).toHaveCount(0)
  })
})
