import { useNavigate } from 'react-router-dom'
import { Home, ChevronRight } from 'lucide-react'

/**
 * PageBreadcrumb — consistent breadcrumb navigation used across photographer routes.
 *
 * Usage:
 *   <PageBreadcrumb crumbs={[
 *     { label: 'Galleries', to: '/' },
 *     { label: gallery.title, to: `/galleries/${id}` },
 *     { label: 'Settings' },   // no `to` = current page (not clickable)
 *   ]} />
 */
export default function PageBreadcrumb({ crumbs = [] }) {
  const navigate = useNavigate()

  return (
    <nav className="flex items-center gap-1 flex-wrap" style={{ minHeight: 28 }}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        const isFirst = i === 0
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            {isLast || !crumb.to ? (
              <span
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text)', maxWidth: 240 }}
              >
                {isFirst ? (
                  <span className="flex items-center gap-1">
                    <Home size={13} />{crumb.label}
                  </span>
                ) : crumb.label}
              </span>
            ) : (
              <button
                onClick={() => navigate(crumb.to, { state: crumb.toState })}
                className="text-sm truncate flex items-center gap-1"
                style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none', maxWidth: 200 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {isFirst ? <><Home size={13} />{crumb.label}</> : crumb.label}
              </button>
            )}
          </div>
        )
      })}
    </nav>
  )
}
