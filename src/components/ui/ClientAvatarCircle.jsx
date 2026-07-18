import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient.js'
import { getClientAvatarUrl } from '../../utils/crmApi.js'

// Same hash-based palette used for avatar colors elsewhere in the app
// (e.g. ClientPicker.jsx, GalleryActivity.jsx's client favorites list), so
// a given client gets a consistent, readable color instead of a flat gray
// that leaves the initials with almost no contrast against their background.
const AVATAR_COLORS = [
  { bg: '#6366f1', color: '#fff' },
  { bg: '#10b981', color: '#fff' },
  { bg: '#f59e0b', color: '#fff' },
  { bg: '#ef4444', color: '#fff' },
  { bg: '#8b5cf6', color: '#fff' },
  { bg: '#14b8a6', color: '#fff' },
]

function avatarColor(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// Module-level cache so re-rendering a list (or mounting it again elsewhere)
// doesn't re-fetch photos that have already been loaded this session.
// Keyed by avatar_r2_key since that uniquely identifies the image.
const avatarUrlCache = new Map()

// Renders an uploaded client photo if one exists and loads successfully,
// otherwise falls back to a colored-initials circle. Fetches its own auth
// session internally so callers don't need to plumb a sessionToken prop
// through -- just pass the client object.
export default function ClientAvatarCircle({ client, size = 24 }) {
  const [url, setUrl] = useState(() => avatarUrlCache.get(client.avatar_r2_key) || null)

  useEffect(() => {
    if (!client.avatar_r2_key) return
    if (avatarUrlCache.has(client.avatar_r2_key)) {
      setUrl(avatarUrlCache.get(client.avatar_r2_key))
      return
    }
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.access_token) return
      getClientAvatarUrl(client.avatar_r2_key, session.access_token).then(result => {
        if (cancelled) return
        avatarUrlCache.set(client.avatar_r2_key, result)
        setUrl(result)
      })
    })
    return () => { cancelled = true }
  }, [client.avatar_r2_key])

  const color = avatarColor(client.email || `${client.first_name} ${client.last_name}`)

  if (url) {
    return (
      <span style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'block' }}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    )
  }

  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 20 ? 9 : 10, fontWeight: 700, flexShrink: 0,
      background: color.bg, color: color.color,
    }}>
      {client.first_name?.[0]}{client.last_name?.[0]}
    </span>
  )
}
