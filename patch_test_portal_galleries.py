import pathlib

path = pathlib.Path("tests/e2e/client/client-portal-galleries.spec.js")
src = path.read_text()

old_tail = '''    try {
      await page.goto(`/client/${oldToken}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText("This link isn't valid")).toBeVisible()

      await page.goto(`/client/${updated.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText("This link isn't valid")).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id })
    }
  })
})'''

assert src.count(old_tail) == 1, "file-tail anchor not found or not unique"

new_tail = old_tail + '''

// ── Gallery access info ─────────────────────────────────────────────────────
// Coverage for the v1.4.4 Access info strip: password/PIN shown per-gallery
// in the portal gallery list, plus the new-tab link behavior added
// alongside it (so the portal, with the codes visible, stays open behind
// the gallery the client is actually looking at).

test.describe('Client portal — gallery access info', () => {
  test('protected gallery shows its password and PIN with working copy buttons', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      require_password: true,
      plain_password: 'gallerypw123',
      require_download_pin: true,
      plain_download_pin: '4242',
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('gallerypw123')).toBeVisible()
      await expect(page.getByText('4242')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy password' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy pin' })).toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('unprotected gallery shows no access info', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({
      client_id: client.id,
      require_password: false,
      require_download_pin: false,
    })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      await expect(page.getByText('Portal Test Gallery')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy password' })).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy pin' })).not.toBeVisible()
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })

  test('gallery links open in a new tab, not in-place', async ({ page }) => {
    const client = await createTestClient()
    const gallery = await createTestGallery({ client_id: client.id })

    try {
      await page.goto(`/client/${client.portal_token}/galleries`)
      await waitForPortalReady(page)
      const galleryLink = page.getByRole('link', { name: 'Portal Test Gallery' })
      await expect(galleryLink).toHaveAttribute('target', '_blank')
      await expect(galleryLink).toHaveAttribute('rel', /noopener/)
    } finally {
      await cleanup({ clientId: client.id, galleryIds: [gallery.id] })
    }
  })
})'''

src = src.replace(old_tail, new_tail)
path.write_text(src)
print("Appended gallery access info tests to client-portal-galleries.spec.js")
