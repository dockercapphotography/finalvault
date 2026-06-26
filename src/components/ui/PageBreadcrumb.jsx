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

  // Collapse long trails so they stay on one line instead of wrapping and
  // clipping a lone crumb on the second line. Mirrors the same pattern
  // Dashboard's own folder breadcrumb uses.
  let displayed = crumbs
  if (crumbs.length > 5) {
    displayed = [
      crumbs[0],
      crumbs[1],
      { label: '…', ellipsis: true },
      crumbs[crumbs.length - 2],
      crumbs[crumbs.length - 1],
    ]
  }

  return (
    <nav className="flex items-center gap-1 flex-wrap" style={{ minHeight: 28 }}>
      {displayed.map((crumb, i) => {
        const isLast = i === displayed.length - 1
        const isFirst = i === 0
        const isEllipsis = crumb.ellipsis
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            )}
            {isEllipsis ? (
              <span className="text-sm px-0.5" style={{ color: 'var(--text-muted)' }}>…</span>
            ) : isLast || !crumb.to ? (
              <span
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text)', maxWidth: 320 }}
                title={crumb.label}
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
                style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none', maxWidth: 320 }}
                title={crumb.label}
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
