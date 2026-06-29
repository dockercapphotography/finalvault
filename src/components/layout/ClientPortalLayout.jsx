import { useState, useEffect } from 'react'
import ClientPortalSidebar from './ClientPortalSidebar.jsx'
import { getPhotographerBranding } from '../../utils/clientApi.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Root cause, confirmed by elimination across several debugging rounds:
// ClientPortalLayout is rendered fresh by each route page's own JSX (it's
// not a persistent wrapper around the router), so React treats it as a
// brand new component instance on every navigation. useState(null) resets
// to null on every fresh mount regardless of any external cache --
// caching getPortalData (see clientApi.js) made the *data fetch* fast,
// but did nothing for this component's own local state, which always
// starts blank the instant the component is recreated. A lazy initializer
// that reads this cache synchronously during the very first render (before
// React paints anything) is what actually prevents the visible flash --
// this was tried once, then removed as "redundant" when the data-fetch
// cache seemed to fix things, but it was never redundant: it was the only
// thing actually preventing this specific remount-reset symptom.
const brandingCache = new Map()

// Analogous to PageWrapper.jsx, but PageWrapper hardcodes the authenticated
// Sidebar directly rather than accepting it as a prop -- so this is a
// parallel wrapper rather than a parameterized version of that one.
export default function ClientPortalLayout({ token, photographerId, pendingContracts, pendingQuestionnaires, children }) {
  const [branding, setBranding] = useState(() =>
    photographerId ? (brandingCache.get(photographerId) || null) : null
  )

  useEffect(() => {
    if (!photographerId) return
    const cached = brandingCache.get(photographerId)
    if (cached) {
      setBranding(cached)
      return
    }
    getPhotographerBranding(photographerId).then(({ name, logoR2Key, avatarR2Key }) => {
      const result = {
        name,
        logoUrl: logoR2Key ? `${WORKER_URL}/logo/${encodeURIComponent(logoR2Key)}` : null,
        avatarR2Key: avatarR2Key || null,
      }
      brandingCache.set(photographerId, result)
      setBranding(result)
    })
  }, [photographerId])

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <ClientPortalSidebar
        token={token}
        branding={branding}
        pendingContracts={pendingContracts}
        pendingQuestionnaires={pendingQuestionnaires}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-7 pt-[calc(1.75rem+52px)] md:pt-7 overflow-auto" style={{ paddingBottom: 'calc(1.75rem + 60px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
