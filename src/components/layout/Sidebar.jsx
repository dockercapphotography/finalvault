import { NavLink } from 'react-router-dom'
import { Images, Settings, Shield } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/account', label: 'Account', icon: Settings },
  { to: '/admin', label: 'Admin', icon: Shield },
]

export default function Sidebar() {
  return (
    <aside className="w-52 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-3 shrink-0">
      <div className="px-3 mb-8">
        <h1 className="text-white font-bold text-base tracking-tight">FinalVault</h1>
        <p className="text-slate-600 text-xs mt-0.5">Gallery Delivery</p>
      </div>
      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
