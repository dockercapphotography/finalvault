import { NavLink } from 'react-router-dom'
import { Images, Settings, Shield } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/account', label: 'Account', icon: Settings },
  { to: '/admin', label: 'Admin', icon: Shield },
]

export default function Sidebar() {
  return (
    <aside className="w-52 flex flex-col py-5 px-3 shrink-0" style={{
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)'
    }}>
      <div className="px-3 mb-6">
        <h1 className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text)' }}>
          FinalVault
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Gallery Delivery</p>
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
  )
}
