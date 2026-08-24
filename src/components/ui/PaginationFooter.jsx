import { ChevronLeft, ChevronRight } from 'lucide-react'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/**
 * Pairs with usePagination -- pass its return values straight through
 * (plus totalCount, which usePagination takes as input rather than
 * returning). Renders nothing when there's nothing to page through.
 *
 * Container-agnostic by default: the border-top spans whatever container
 * this sits in, no negative margins baked in. If a caller's container has
 * its own horizontal padding and wants the border to run edge-to-edge (as
 * the zip job monitor does inside its px-5 SettingsSection card), pass
 * className="-mx-5 px-5" (matching that container's own padding) --
 * these need to land on THIS component's own root element to work, not a
 * wrapper div around it, since the border lives on this element.
 */
export default function PaginationFooter({
  page, setPage, pageSize, setPageSize, totalPages, rangeStart, rangeEnd, totalCount,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className = '',
}) {
  if (totalCount === 0) return null

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 pt-3 ${className}`} style={{ borderTop: '1px solid var(--border)' }}>
      <p className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        Showing {rangeStart}&ndash;{rangeEnd} of {totalCount}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Rows per page</label>
          <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} aria-label="Rows per page"
            className="text-xs rounded-lg px-2 py-1" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
            {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page"
            className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', border: 'none', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
            <ChevronLeft size={14} style={{ color: 'var(--text)' }} />
          </button>
          {totalPages > 1 && (
            <span className="text-xs whitespace-nowrap px-1" style={{ color: 'var(--text-muted)' }}>
              Page {page + 1} of {totalPages}
            </span>
          )}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page"
            className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', border: 'none', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
            <ChevronRight size={14} style={{ color: 'var(--text)' }} />
          </button>
        </div>
      </div>
    </div>
  )
}
