import { useEffect, useState } from 'react'
import { getSiteByHostname } from '../utils/micrositeApi.js'
import MicrositePlaceholder from './MicrositePlaceholder.jsx'
import MicrositeRenderer from '../components/microsite/MicrositeRenderer.jsx'

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
