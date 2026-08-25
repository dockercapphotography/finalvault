import { Mail, Phone, MapPin } from 'lucide-react'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Deliberately duplicated rather than shared with ClientPortalSidebar's
// version — same reasoning as that component's own header comment: this
// is a small, self-contained piece, not worth a shared abstraction across
// an authenticated dashboard component and a public marketing page.
function studioInitials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// site: the { type: 'placeholder', ... } payload from get_site_by_hostname.
export default function MicrositePlaceholder({ site }) {
  const {
    business_name: businessName,
    avatar_r2_key: avatarR2Key,
    logo_r2_key: logoR2Key,
    business_email: businessEmail,
    business_phone: businessPhone,
    business_city: businessCity,
    business_state: businessState,
    accent_color: accentColor,
  } = site

  const imageR2Key = logoR2Key || avatarR2Key
  const initials = studioInitials(businessName)
  const location = [businessCity, businessState].filter(Boolean).join(', ')
  const accent = accentColor || '#4F46E5'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-6"
        style={{ background: 'var(--surface-raised)', flexShrink: 0 }}>
        {imageR2Key ? (
          <img
            src={`${WORKER_URL}/avatar/${encodeURIComponent(imageR2Key)}`}
            alt=""
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <span style={{ color: accent, fontSize: 22, fontWeight: 700 }}>{initials}</span>
        )}
      </div>

      <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
        {businessName || 'Photography Studio'}
      </h1>

      {location && (
        <p className="flex items-center gap-1.5 text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          <MapPin size={14} />
          {location}
        </p>
      )}

      <p className="text-sm mt-6 max-w-sm" style={{ color: 'var(--text-muted)' }}>
        This website is still being set up. In the meantime, here's how to get in touch.
      </p>

      <div className="flex flex-col gap-2.5 mt-6">
        {businessEmail && (
          <a href={`mailto:${businessEmail}`}
            className="flex items-center gap-2 text-sm justify-center"
            style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <Mail size={15} style={{ color: accent }} />
            {businessEmail}
          </a>
        )}
        {businessPhone && (
          <a href={`tel:${businessPhone}`}
            className="flex items-center gap-2 text-sm justify-center"
            style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <Phone size={15} style={{ color: accent }} />
            {businessPhone}
          </a>
        )}
      </div>
    </div>
  )
}
