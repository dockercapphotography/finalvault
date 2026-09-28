import { useEffect, useState } from 'react'
import { getMyMicrosite } from '../utils/micrositeApi.js'
import { supabase } from '../supabaseClient.js'
import MicrositeRenderer from '../components/microsite/MicrositeRenderer.jsx'

// Standalone route, meant to be embedded in an <iframe> from
// MicrositeEditor.jsx -- not linked to directly anywhere. Renders the
// SAME MicrositeRenderer used for real visitors (via CustomDomainRoot),
// just fetched by auth instead of by hostname. Deliberately reads the
// photographer's own row directly rather than accepting props from the
// parent frame, so it always reflects the last SAVED state -- no
// cross-frame state syncing needed, just reload the iframe after a save.
export default function MicrositePreviewPage() {
  const [site, setSite] = useState(undefined) // undefined = loading
  const [authToken, setAuthToken] = useState(null)

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'microsite-preview-update') {
        setSite(event.data.site)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyMicrosite()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) setAuthToken(session.access_token)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: photographer } = await supabase
            .from('photographers')
            .select('logo_r2_key, social_links, all_sessions_token')
            .eq('id', user.id)
            .maybeSingle()
          // Same fallback get_site_by_hostname applies server-side (sql/037):
          // no per-site logo override -> fall back to the account logo.
          if (!data.logo_r2_key && photographer?.logo_r2_key) {
            data.logo_r2_key = photographer.logo_r2_key
          }
          // social_links lives on photographers, not microsites -- always
          // merge it in, there's no override concept for it.
          data.social_links = photographer?.social_links || {}
          // Same extras get_site_by_hostname merges in for the live site
          // (sql/057, sql/085). Resolved here rather than relying on the
          // editor's postMessage: the iframe reloads after every Save, and
          // a message sent before the reloaded page is listening is lost --
          // which would drop every package's Book button until the next edit.
          if (!data.all_sessions_token) data.all_sessions_token = photographer?.all_sessions_token || null
          const { data: pages } = await supabase
            .from('signup_pages')
            .select('id, token, is_active, archived_at')
            .eq('photographer_id', user.id)
          data.package_booking_tokens = Object.fromEntries(
            (pages || [])
              .filter(p => p.token && p.is_active !== false && !p.archived_at)
              .map(p => [p.id, p.token])
          )
        }
        setSite(data)
      } catch {
        setSite(null)
      }
    }
    load()
  }, [])

  if (site === undefined) return null
  if (!site) {
    return <p style={{ padding: 24, fontFamily: 'sans-serif', color: '#888' }}>Couldn't load preview.</p>
  }

  return <MicrositeRenderer site={site} previewAuthToken={authToken} />
}
