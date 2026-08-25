import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import MicrositePlaceholder from './MicrositePlaceholder.jsx'

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

  if (site === undefined) return null

  if (site.type === 'placeholder') {
    return <MicrositePlaceholder site={site} />
  }

  if (site.type === 'microsite') {
    // TODO: full themed public renderer — the editor (Content/Design tabs,
    // section variants, accent/font/shape tokens) hasn't been built yet,
    // so there's no real photographer-facing way to get a microsites row
    // to enabled=true today. This branch is unreachable in production
    // until that editor ships; placeholder-style rendering here is a safe,
    // honest fallback rather than pretending the themed renderer exists.
    return <MicrositePlaceholder site={{
      business_name: site.studio_name,
      business_email: site.contact_email,
      accent_color: site.accent_color,
    }} />
  }

  // type === 'not_found' — domain isn't recognized or isn't active.
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Nothing here yet.</p>
    </div>
  )
}
