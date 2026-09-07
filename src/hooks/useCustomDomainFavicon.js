import { useEffect } from 'react'
import { isAppHost } from '../utils/isAppHost.js'
import { getSiteByHostname } from '../utils/micrositeApi.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Swaps in the photographer's own custom-domain favicon (set via
// Website > Content > Branding, stored on microsites.favicon_r2_key) as
// the browser-tab icon on ANY page rendered under that domain -- not
// just the microsite root ("/"), which is the only place this used to
// apply. CustomDomainRoot.jsx now delegates to this same hook rather
// than keeping its own separate copy of this logic.
//
// A gallery share link, a booking page, the client portal -- all render
// under the exact same custom domain a photographer's microsite does,
// so all of them should show that photographer's own icon instead of
// FinalVault's default, regardless of whether the specific page has
// anything to do with the microsite feature itself.
//
// Deliberately does its own independent getSiteByHostname() fetch
// rather than accepting the result as a prop -- the pages that need
// this (gallery view, booking, client portal, etc.) are all unrelated,
// standalone route components with no shared parent to thread data
// through. The extra network request this causes on the microsite root
// page specifically (where CustomDomainRoot.jsx already fetches the
// same thing for its own render decision) is a small, acceptable
// tradeoff for keeping "resolve this hostname" and "decide what to
// render" as separate concerns.
//
// No favicon set (no microsite, or a microsite with no favicon
// uploaded) is a silent no-op -- the default FinalVault icon from
// index.html stays exactly as-is. Also a no-op entirely on the main app
// host (final-vault.app) -- there's no custom domain to resolve there.
export function useCustomDomainFavicon() {
  useEffect(() => {
    if (isAppHost()) return

    let cancelled = false
    getSiteByHostname(window.location.hostname).then(site => {
      if (cancelled || !site?.favicon_r2_key) return

      const href = `${WORKER_URL}/logo/${encodeURIComponent(site.favicon_r2_key)}`

      // Removing existing <link rel="icon"> tags first, rather than just
      // appending, avoids relying on document-order tie-breaking across
      // browsers when multiple icon links are present -- there's no
      // consistently specified winner.
      document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove())

      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = href
      document.head.appendChild(link)
    })

    return () => { cancelled = true }
  }, [])
}
