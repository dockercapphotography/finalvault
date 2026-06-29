import { NavLink } from 'react-router-dom'
import { Images, FileText, ClipboardList } from 'lucide-react'

// Sibling to Sidebar.jsx, deliberately not shared/parameterized -- this nav
// is anonymous and token-scoped, while Sidebar.jsx is authenticated and
// wired to auth.uid(). See docs/CLIENT_PORTAL_SPEC.md for the reasoning.
//
// pendingContracts / pendingQuestionnaires drive the small badge dot so
// outstanding items are visible from any section, not just when the
// client happens to be looking at that tab.
//
// Header deliberately does NOT render the photographer's logo image --
// after three rounds of trying to make a possibly-white, possibly-
// transparent logo legible against this sidebar's background (a chip, a
// dual-tone drop-shadow halo), a small solid-color initials square became
// the reliable fallback: no color assumptions about the source asset,
// works for any studio regardless of their logo's palette.
//
// The actual profile photo (avatar_r2_key, separate from logo_r2_key) is a
// different asset with a different failure mode -- a normal headshot
// photo doesn't have the transparent-background problem a logo wordmark
// does, so it's safe to render directly when present. Initials stay as
// the fallback for photographers who haven't set an avatar.
const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function studioInitials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function ClientPortalSidebar({
  token,
  branding,
  pendingContracts = 0,
  pendingQuestionnaires = 0,
}) {
  const navItems = [
    { to: `/client/${token}/galleries`, label: 'Galleries', icon: Images },
    { to: `/client/${token}/contracts`, label: 'Contracts', icon: FileText, badge: pendingContracts > 0 },
    { to: `/client/${token}/questionnaires`, label: 'Questionnaires', icon: ClipboardList, badge: pendingQuestionnaires > 0 },
  ]

  const initials = studioInitials(branding?.name)

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 flex-col py-5 px-3.5 shrink-0" style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>
        <div className="flex items-center gap-2.5 px-1 pb-4 mb-3.5" style={{ borderBottom: '1px solid var(--border)', minHeight: 44 }}>
          {branding && (
            <>
              {branding.avatarR2Key ? (
                <img
                  src={`${WORKER_URL}/avatar/${encodeURIComponent(branding.avatarR2Key)}`}
                  alt=""
                  className="w-7 h-7 rounded-lg flex-shrink-0"
                  style={{ objectFit: 'cover' }}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: '#1a1a1a' }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{initials}</span>
                </div>
              )}
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                {branding.name || ''}
              </p>
            </>
          )}
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={({ isActive }) => ({
                background: isActive ? 'var(--surface-raised)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: isActive ? '500' : '400',
                position: 'relative',
              })}
            >
              <Icon size={15} />
              {label}
              {badge && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#d97706', marginLeft: 'auto', flexShrink: 0,
                }} />
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-evenly"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navItems.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            style={({ isActive }) => ({
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? '500' : '400',
              gap: 3,
              position: 'relative',
            })}
          >
            <span style={{ position: 'relative' }}>
              <Icon size={18} />
              {badge && (
                <span style={{
                  position: 'absolute', top: -2, right: -4,
                  width: 5, height: 5, borderRadius: '50%', background: '#d97706',
                }} />
              )}
            </span>
            <span style={{ fontSize: 10 }}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
