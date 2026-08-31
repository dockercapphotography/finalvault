import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import MicrositePlaceholder from './MicrositePlaceholder.jsx'
import MicrositeRenderer from '../components/microsite/MicrositeRenderer.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Rendered as the "/" route element whenever isAppHost() is false — i.e.
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

  // Swaps in the photographer's own dedicated favicon as the browser-tab
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
  }, [site?.favicon_r2_key])

  if (site === undefined) return null

  if (site.type === 'placeholder') {
    return <MicrositePlaceholder site={site} />
  }

  if (site.type === 'microsite') {
    return <MicrositeRenderer site={site} />
  }

  // type === 'not_found' — domain isn't recognized or isn't active.
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Nothing here yet.</p>
    </div>
  )
}
