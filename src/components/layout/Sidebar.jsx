import { NavLink } from 'react-router-dom'
import { Images, Settings, Bookmark, Users, CalendarDays } from 'lucide-react'
import NotificationBell from './NotificationBell.jsx'

const baseNavItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/bookmarked', label: 'Bookmarked', icon: Bookmark },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/account', label: 'Account', icon: Settings },
]

const LogoMark = () => (
  <img src="/finalvault_logo.svg" alt="FinalVault" width="28" height="28" style={{ flexShrink: 0 }} />
)

export default function Sidebar() {
  const navItems = baseNavItems

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 flex-col py-5 px-3 shrink-0" style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>
        <div className="px-3 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text)',
            }}>
              FinalVault
            </span>
          </div>
          <NotificationBell />
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={({ isActive }) => ({
                background: isActive ? 'var(--surface-raised)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                fontWeight: isActive ? '500' : '400',
              })}
            >
              <Icon size={15} />
              {label}
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
        {[
          { to: '/', label: 'Galleries', icon: Images, end: true },
          { to: '/clients', label: 'Clients', icon: Users },
          { to: '/sessions', label: 'Sessions', icon: CalendarDays },
          { to: '/bookmarked', label: 'Bookmarked', icon: Bookmark },
          { to: '/account', label: 'Account', icon: Settings },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            style={({ isActive }) => ({
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? '500' : '400',
              gap: 3,
            })}
          >
            <Icon size={18} />
            <span style={{ fontSize: 10 }}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
