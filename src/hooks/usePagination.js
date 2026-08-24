import { useState, useEffect } from 'react'

/**
 * Pagination STATE only -- deliberately doesn't know how data is fetched.
 * Works equally well for:
 *   - server-side queries (use `from`/`to` in a Supabase .range() call,
 *     paired with a `{ count: 'exact' }` select to get totalCount)
 *   - in-memory pagination over an already-fetched array (use `from`/`to`
 *     with .slice(from, to + 1), totalCount = array.length)
 *
 * `resetKey` -- pass anything that should reset back to page 1 when it
 * changes (filters, search text, a gallery/tab switch, etc). Changing
 * pageSize itself always resets to page 1 too, automatically.
 */
export function usePagination({ totalCount, initialPageSize = 25, resetKey }) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)

  useEffect(() => { setPage(0) }, [resetKey, pageSize])

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = page * pageSize
  const to = from + pageSize - 1
  const rangeStart = totalCount === 0 ? 0 : from + 1
  const rangeEnd = Math.min(totalCount, from + pageSize)

  return { page, setPage, pageSize, setPageSize, totalPages, from, to, rangeStart, rangeEnd }
}
