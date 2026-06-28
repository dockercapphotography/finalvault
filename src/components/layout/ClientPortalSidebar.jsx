import { NavLink } from 'react-router-dom'
import { Images, FileText, ClipboardList } from 'lucide-react'

// Sibling to Sidebar.jsx, deliberately not shared/parameterized -- this nav
// is anonymous and token-scoped, while Sidebar.jsx is authenticated and
// wired to auth.uid(). See docs/CLIENT_PORTAL_SPEC.md for the reasoning.
//
// hasQuestionnaires lets the parent omit the Questionnaires item entirely
// when a client has never had one assigned, rather than showing an empty
// section. pendingContracts / pendingQuestionnaires drive the small badge
// dot so outstanding items are visible from any section, not just when the
// client happens to be looking at that tab.
export default function ClientPortalSidebar({
  token,
  hasQuestionnaires = true,
  pendingContracts = 0,
  pendingQuestionnaires = 0,
}) {
  const navItems = [
    { to: `/client/${token}/galleries`, label: 'Galleries', icon: Images },
    { to: `/client/${token}/contracts`, label: 'Contracts', icon: FileText, badge: pendingContracts > 0 },
    ...(hasQuestionnaires
      ? [{ to: `/client/${token}/questionnaires`, label: 'Questionnaires', icon: ClipboardList, badge: pendingQuestionnaires > 0 }]
      : []),
  ]

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 flex-col py-5 px-3 shrink-0" style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
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
