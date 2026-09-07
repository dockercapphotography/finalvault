import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import { useCustomDomainFavicon } from '../hooks/useCustomDomainFavicon.js'
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

  // Favicon swap now lives in a shared hook (useCustomDomainFavicon) --
  // reused across every custom-domain page, not just this microsite
  // root, so a gallery link, booking page, or client portal on the same
  // domain shows the photographer's own icon too. Does its own
  // independent hostname lookup rather than reusing `site` above (see
  // the hook's own comment for why) -- a small duplicate fetch here
  // specifically, traded for keeping the two concerns decoupled.
  useCustomDomainFavicon()

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
