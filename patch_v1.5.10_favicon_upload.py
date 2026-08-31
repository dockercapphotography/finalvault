#!/usr/bin/env python3
"""
v1.5.10 — Custom-domain favicon, part 2: dedicated favicon upload

Supersedes the favicon behavior from patch_v1.5.10_favicon.py (which reused
the microsite/account logo). This adds a real, separate favicon upload
under Website > Content > Branding, alongside the existing logo and dark
logo overrides:

- Editable only on the microsite (favicon_r2_key on `microsites`, not
  `photographers`) -- that's where the UI lives, and unlike the logo there
  is deliberately NO fallback to the studio logo: a regular logo is often
  not square/simple enough to read as a 16x16 tab icon. No favicon
  uploaded falls all the way back to FinalVault's default icon.
- No new worker route: favicons upload under the same
  photographers/{id}/logos/ prefix as the logo/dark logo overrides, so
  they're served by the existing public /logo/:key route with zero
  worker changes.
- No RPC changes: get_site_by_hostname()'s 'microsite' branch (sql/053)
  builds its return value from to_jsonb(v_microsite), which picks up the
  new favicon_r2_key column automatically. Requires sql/054 to have been
  run first (see the accompanying SQL file) -- the column must exist for
  the app to compile/save against it meaningfully, though this patch
  itself doesn't touch the database.

REQUIRES patch_v1.5.10_favicon.py to already be applied (Nick's
CustomDomainRoot.jsx already has the WORKER_URL const and the favicon
useEffect from that patch) -- this patch edits that effect in place
rather than reintroducing it.

Run from the repo root:
    python3 patch_v1.5.10_favicon_upload.py
"""
import pathlib

EDITOR = pathlib.Path("src/routes/MicrositeEditor.jsx")
ROOT = pathlib.Path("src/routes/CustomDomainRoot.jsx")


def apply_unique(text, old, new, path, label):
    count = text.count(old)
    assert count == 1, (
        f"[{label}] Expected exactly one match in {path}, found {count}. "
        "The file may already be patched, or has changed since this script was "
        "written -- stopping without writing anything."
    )
    return text.replace(old, new)


def patch_editor():
    text = EDITOR.read_text()

    # Step 1: state + refs
    old = """  const [showAboutFocalModal, setShowAboutFocalModal] = useState(false)
  const [accountLogoKey, setAccountLogoKey] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false)
  const [showDarkLogoSection, setShowDarkLogoSection] = useState(false)
  const saveTimeoutRef = useRef(null)
  const logoInputRef = useRef(null)
  const logoDarkInputRef = useRef(null)"""
    new = """  const [showAboutFocalModal, setShowAboutFocalModal] = useState(false)
  const [accountLogoKey, setAccountLogoKey] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false)
  const [showDarkLogoSection, setShowDarkLogoSection] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [showFaviconSection, setShowFaviconSection] = useState(false)
  const saveTimeoutRef = useRef(null)
  const logoInputRef = useRef(null)
  const logoDarkInputRef = useRef(null)
  const faviconInputRef = useRef(null)"""
    text = apply_unique(text, old, new, EDITOR, "state/refs")

    # Step 2: upload/remove handlers, mirroring handleLogoDarkSelect/Remove
    old = """  async function handleLogoDarkRemove() {
    if (!site.logo_dark_r2_key) return
    setUploadingLogoDark(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.logo_dark_r2_key)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {})
      patch({ logo_dark_r2_key: null })
    } finally {
      setUploadingLogoDark(false)
    }
  }"""
    new = old + """

  async function handleFaviconSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingFavicon(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      // Clean up the previous favicon file, if any, before uploading the new one.
      if (site.favicon_r2_key) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.favicon_r2_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const ext = file.name.split('.').pop()
      // Same photographers/{id}/logos/ prefix as the logo/dark logo overrides --
      // that's what makes this servable via the existing public /logo/:key
      // worker route with no worker changes.
      const r2Key = `photographers/${user.id}/logos/microsite-favicon-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      patch({ favicon_r2_key: r2Key })
    } catch (err) {
      console.error('Favicon upload error:', err)
    } finally {
      setUploadingFavicon(false)
    }
  }

  async function handleFaviconRemove() {
    if (!site.favicon_r2_key) return
    setUploadingFavicon(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.favicon_r2_key)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {})
      patch({ favicon_r2_key: null })
    } finally {
      setUploadingFavicon(false)
    }
  }"""
    text = apply_unique(text, old, new, EDITOR, "upload/remove handlers")

    # Step 3: include favicon_r2_key in handleSave's field list. The same
    # line appears twice verbatim -- once in the destructure off `site`,
    # once in the object literal passed to updateMyMicrosite() -- and both
    # need the identical addition, so this one replaces both occurrences.
    old_line = "        contact_title, contact_subheading, logo_dark_r2_key,\n"
    new_line = "        contact_title, contact_subheading, logo_dark_r2_key, favicon_r2_key,\n"
    count = text.count(old_line)
    assert count == 2, (
        f"[handleSave field list] Expected exactly two matches in {EDITOR}, found {count}. "
        "The file may already be patched, or has changed since this script was written -- "
        "stopping without writing anything."
    )
    text = text.replace(old_line, new_line)

    # Step 4: the Branding section's UI -- a favicon block mirroring the
    # dark logo block immediately above it (same collapsed-by-default
    # pattern, since this is equally optional).
    old = """          ) : (
            <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowDarkLogoSection(true)} className="text-sm font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add a dark logo variant
              </button>
            </div>
          )}
        </SettingsSection>"""
    new = """          ) : (
            <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowDarkLogoSection(true)} className="text-sm font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add a dark logo variant
              </button>
            </div>
          )}
          {(site.favicon_r2_key || showFaviconSection) ? (
            <div className="px-5 py-4 flex items-center gap-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <LogoPreview r2Key={site.favicon_r2_key} />
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {site.favicon_r2_key ? 'Favicon set' : 'Optional — shown in the browser tab on your custom domain. Square works best. Falls back to the FinalVault icon if not set.'}
                </p>
                <button onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon} className="self-start text-sm font-medium px-3 py-1.5 rounded-lg text-left"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  {uploadingFavicon ? 'Uploading…' : site.favicon_r2_key ? 'Replace' : 'Upload a favicon'}
                </button>
                {site.favicon_r2_key && (
                  <button onClick={handleFaviconRemove} disabled={uploadingFavicon} className="text-sm text-left" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Remove
                  </button>
                )}
                <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" style={{ display: 'none' }} onChange={handleFaviconSelect} />
              </div>
            </div>
          ) : (
            <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowFaviconSection(true)} className="text-sm font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add a favicon
              </button>
            </div>
          )}
        </SettingsSection>"""
    text = apply_unique(text, old, new, EDITOR, "Branding section UI")

    EDITOR.write_text(text)
    print(f"Patched {EDITOR}")


def patch_custom_domain_root():
    text = ROOT.read_text()

    old = """  // Swaps in the photographer's own logo as the browser-tab favicon,
  // replacing FinalVault's default (declared statically in index.html).
  // Covers both a full microsite and the placeholder page -- both
  // branches of get_site_by_hostname() already return logo_r2_key
  // (microsite: its own override, falling back to the account logo;
  // placeholder: the account logo directly -- see sql/053). Served from
  // the existing fully-public /logo/:key worker route (no auth, no
  // microsite-enabled check needed), the same one already used for the
  // client portal, client galleries, and questionnaire submit pages --
  // so this works even before a microsite exists. Does nothing when
  // there's no logo to show, leaving index.html's static FinalVault
  // icons in place.
  useEffect(() => {
    if (!site || !site.logo_r2_key) return

    const href = `${WORKER_URL}/logo/${encodeURIComponent(site.logo_r2_key)}`

    // Removing the static <link rel="icon"> tags from index.html first,
    // rather than just appending a new one, avoids relying on
    // document-order tie-breaking across browsers when multiple icon
    // links are present -- there's no consistently specified winner.
    document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove())

    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = href
    document.head.appendChild(link)
  }, [site?.logo_r2_key])"""
    new = """  // Swaps in the photographer's own dedicated favicon as the browser-tab
  // icon, replacing FinalVault's default (declared statically in
  // index.html). Deliberately a separate field from logo_r2_key
  // (favicon_r2_key, uploaded from Website > Content > Branding -- see
  // sql/054): a studio's regular logo is often not square/simple enough
  // to read at 16x16, so there's no logo fallback here -- no favicon
  // uploaded just falls all the way back to FinalVault's icon. Only the
  // 'microsite' branch of get_site_by_hostname() returns favicon_r2_key
  // (to_jsonb(v_microsite) picks up the new column automatically, per
  // sql/053) -- the placeholder page always shows the default until a
  // microsite exists, matching where the upload UI lives. Served from
  // the existing fully-public /logo/:key worker route (no auth needed) --
  // favicons upload under the same photographers/{id}/logos/ prefix as
  // the logo/dark logo overrides, so no worker changes were needed to
  // serve them.
  useEffect(() => {
    if (!site || !site.favicon_r2_key) return

    const href = `${WORKER_URL}/logo/${encodeURIComponent(site.favicon_r2_key)}`

    // Removing the static <link rel="icon"> tags from index.html first,
    // rather than just appending a new one, avoids relying on
    // document-order tie-breaking across browsers when multiple icon
    // links are present -- there's no consistently specified winner.
    document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove())

    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = href
    document.head.appendChild(link)
  }, [site?.favicon_r2_key])"""
    text = apply_unique(text, old, new, ROOT, "favicon effect")

    ROOT.write_text(text)
    print(f"Patched {ROOT}")


def main():
    patch_editor()
    patch_custom_domain_root()


if __name__ == "__main__":
    main()
