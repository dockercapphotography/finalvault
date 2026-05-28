import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Images, Settings, Shield } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import NotificationBell from './NotificationBell.jsx'

const baseNavItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/account', label: 'Account', icon: Settings },
]

export default function Sidebar() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('photographers')
        .select('is_admin')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setIsAdmin(data?.is_admin || false))
    })
  }, [])

  const navItems = isAdmin
    ? [...baseNavItems, { to: '/admin', label: 'Admin', icon: Shield }]
    : baseNavItems

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-52 flex-col py-5 px-3 shrink-0" style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>
        <div className="px-3 mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
              FinalVault
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Gallery Delivery</p>
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {baseNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors"
            style={({ isActive }) => ({
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? '500' : '400',
            })}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
        <NotificationBell mobile />
        {isAdmin && (
          <NavLink
            to="/admin"
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors"
            style={({ isActive }) => ({
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: isActive ? '500' : '400',
            })}
          >
            <Shield size={20} />
            Admin
          </NavLink>
        )}
      </nav>
    </>
  )
}
