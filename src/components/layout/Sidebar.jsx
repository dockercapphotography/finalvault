import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import NotificationBell from './NotificationBell.jsx'
import MobileBottomNav from './MobileBottomNav.jsx'
import MobileMoreSheet from './MobileMoreSheet.jsx'
import {
  NAV_DESTINATIONS, destinationByKey, destinationForPath, getCachedMobileNav, loadMobileNav,
} from '../../utils/mobileNav.js'

// Desktop shows every destination; mobile shows the photographer's picks
// plus More (src/utils/mobileNav.js, sql/113).
const baseNavItems = NAV_DESTINATIONS

const LogoMark = () => (
  <img src="/finalvault_logo.svg" alt="FinalVault" width="28" height="28" style={{ flexShrink: 0 }} />
)

export default function Sidebar() {
  const navItems = baseNavItems
  const location = useLocation()
  const [mobilePicked, setMobilePicked] = useState(getCachedMobileNav)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadMobileNav().then(keys => { if (!cancelled) setMobilePicked(keys) })
    return () => { cancelled = true }
  }, [])

  // More lights up while its sheet is open or the current page is one of
  // the destinations kept in it.
  const currentDestination = destinationForPath(location.pathname)
  const mobileItems = [
    ...mobilePicked.map(key => {
      const d = destinationByKey(key)
      return { ...d, testId: `mobile-nav-${d.key}` }
    }),
    {
      label: 'More', icon: MoreHorizontal, testId: 'mobile-nav-more',
      onClick: () => setMoreOpen(true),
      active: moreOpen || Boolean(currentDestination && !mobilePicked.includes(currentDestination)),
    },
  ]

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
      <MobileBottomNav items={mobileItems} />
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)}
        picked={mobilePicked} onPickedChange={setMobilePicked} />
    </>
  )
}
