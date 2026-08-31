#!/usr/bin/env python3
"""
v1.5.10 — Custom-domain favicon
Patches src/routes/CustomDomainRoot.jsx to swap in the photographer's own
logo as the browser-tab favicon on their custom domain, instead of always
showing FinalVault's default (declared statically in index.html).

No SQL, no RPC changes, no worker changes:
- get_site_by_hostname() already returns logo_r2_key on both the
  'microsite' and 'placeholder' branches (see sql/053).
- The /logo/:key R2 worker route is already fully public (no auth), and
  already used elsewhere (ClientPortalLayout.jsx, SubmitForm.jsx,
  ClientGallery.jsx).

Run from the repo root:
    python3 patch_v1.5.10_favicon.py
"""
import pathlib

TARGET = pathlib.Path("src/routes/CustomDomainRoot.jsx")

OLD_HEAD = """import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import MicrositePlaceholder from './MicrositePlaceholder.jsx'
import MicrositeRenderer from '../components/microsite/MicrositeRenderer.jsx'

// Rendered as the \"/\" route element whenever isAppHost() is false — i.e.
// the request arrived on a photographer's custom domain, not
// final-vault.app. See sql/035_microsite_hostname_resolution.sql and
// docs/microsite-spec.md for the full design.
export default function CustomDomainRoot() {
  const [site, setSite] = useState(undefined) // undefined = loading

  useEffect(() => {
    let cancelled = false
    getSiteByHostname(window.location.hostname).then(data => {
      if (!cancelled) setSite(data)
    })
    return () => { cancelled = true }
  }, [])

  if (site === undefined) return null"""

NEW_HEAD = """import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import MicrositePlaceholder from './MicrositePlaceholder.jsx'
import MicrositeRenderer from '../components/microsite/MicrositeRenderer.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Rendered as the \"/\" route element whenever isAppHost() is false — i.e.
// the request arrived on a photographer's custom domain, not
// final-vault.app. See sql/035_microsite_hostname_resolution.sql and
// docs/microsite-spec.md for the full design.
export default function CustomDomainRoot() {
  const [site, setSite] = useState(undefined) // undefined = loading

  useEffect(() => {
    let cancelled = false
    getSiteByHostname(window.location.hostname).then(data => {
      if (!cancelled) setSite(data)
    })
    return () => { cancelled = true }
  }, [])

  // Swaps in the photographer's own logo as the browser-tab favicon,
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
  }, [site?.logo_r2_key])

  if (site === undefined) return null"""


def main():
    text = TARGET.read_text()

    assert text.count(OLD_HEAD) == 1, (
        f"Expected exactly one match for the current CustomDomainRoot.jsx head in {TARGET}. "
        "The file may have already been patched, or has changed since this script was written -- "
        "stopping without writing anything."
    )

    text = text.replace(OLD_HEAD, NEW_HEAD)
    TARGET.write_text(text)
    print(f"Patched {TARGET}")


if __name__ == "__main__":
    main()
