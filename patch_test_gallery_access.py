import pathlib

path = pathlib.Path("tests/e2e/client/gallery-access.spec.js")
src = path.read_text()

old_tail = '''  test('preview mode bypasses password gate', async ({ page }) => {
    const pwGallery = await createGallery({ require_password: true, plain_password: 'secret' })
    try {
      await page.goto(`/g/${pwGallery.share_token}?preview=1`)
      await expect(page).toHaveURL(`/g/${pwGallery.share_token}/view?preview=1`, { timeout: 10000 })
      await expect(page.getByText('Preview Mode')).toBeVisible()
    } finally {
      await cleanupGallery(pwGallery.id)
    }
  })
})'''

assert src.count(old_tail) == 1, "file-tail anchor not found or not unique"

new_tail = old_tail + '''

// ── Password persistence & revocation ────────────────────────────────────────
// Covers the v1.4.4 fix: the "unlocked" flag now persists via localStorage
// (so it survives across tabs -- necessary once portal gallery links open
// in a new tab) AND tracks which password unlocked it, so regenerating a
// gallery's password revokes previously-unlocked visitors without
// disabling the gallery for anyone else.

test.describe('Gallery access — password persistence & revocation', () => {
  test('returning visitor skips the password gate after unlocking once', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'supersecret' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await expect(page.getByRole('button', { name: 'View Gallery' })).toBeEnabled({ timeout: 3000 })
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await page.getByPlaceholder('Enter gallery password').fill('supersecret')
      await page.getByRole('button', { name: 'Unlock Gallery' }).click()
      await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })

      // Re-visiting the gallery root should skip straight past both the
      // name gate (already covered elsewhere) AND the password gate --
      // this second part is the actual regression test for the
      // sessionStorage -> localStorage fix.
      await page.goto(`/g/${gallery.share_token}`)
      await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })
    } finally {
      await cleanupGallery(gallery.id)
    }
  })

  test('regenerating the gallery password re-locks a previously unlocked visitor', async ({ page }) => {
    const gallery = await createGallery({ require_password: true, plain_password: 'originalpass' })
    try {
      await page.goto(`/g/${gallery.share_token}`)
      await waitForGateReady(page)
      await page.getByPlaceholder('Enter your email to continue').fill('jane@example.com')
      await expect(page.getByRole('button', { name: 'View Gallery' })).toBeEnabled({ timeout: 3000 })
      await page.getByRole('button', { name: 'View Gallery' }).click()
      await page.getByPlaceholder('Enter gallery password').fill('originalpass')
      await page.getByRole('button', { name: 'Unlock Gallery' }).click()
      await expect(page).toHaveURL(`/g/${gallery.share_token}/view`, { timeout: 10000 })

      // Simulate the photographer regenerating the password from Gallery
      // Settings -- a direct update is equivalent for this test's purposes,
      // since the fix is about what the client reads on next load, not
      // about how the photographer's own update flow works (already
      // covered by gallery-settings.spec.js).
      await sb().from('galleries').update({ plain_password: 'newpassword' }).eq('id', gallery.id)

      await page.goto(`/g/${gallery.share_token}`)
      await expect(page.getByText('This gallery is password protected')).toBeVisible({ timeout: 10000 })
      await expect(page.getByPlaceholder('Enter gallery password')).toBeVisible()
    } finally {
      await cleanupGallery(gallery.id)
    }
  })
})'''

src = src.replace(old_tail, new_tail)
path.write_text(src)
print("Appended password persistence/revocation tests to gallery-access.spec.js")
