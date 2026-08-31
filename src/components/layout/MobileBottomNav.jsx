import { NavLink } from 'react-router-dom'

export default function MobileBottomNav({ items, breakpoint = 'md' }) {
  const hiddenClass = breakpoint === 'lg' ? 'lg:hidden' : 'md:hidden'

  return (
    <nav
      className={`${hiddenClass} fixed bottom-0 left-0 right-0 z-40 flex items-center justify-evenly`}
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        height: 60,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map(({ to, onClick, label, icon: Icon, end, active, testId }) => {
        const content = (
          <>
            <Icon size={18} />
            <span style={{ fontSize: 10 }}>{label}</span>
          </>
        )
        if (to) {
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testId}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
              style={({ isActive }) => ({
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isActive ? '500' : '400',
                gap: 3,
              })}
            >
              {content}
            </NavLink>
          )
        }
        return (
          <button
            key={label}
            onClick={onClick}
            data-testid={testId}
            className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            style={{
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: active ? '500' : '400',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {content}
          </button>
        )
      })}
    </nav>
  )
}
