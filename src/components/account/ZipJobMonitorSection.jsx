import { useState, useEffect, useRef } from 'react'
import { RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { expireZipJob } from '../../utils/galleryApi.js'
import SettingsSection from '../ui/SettingsSection.jsx'
import BottomSheet from '../layout/BottomSheet.jsx'
import Modal from '../ui/Modal.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import PaginationFooter from '../ui/PaginationFooter.jsx'
import { usePagination } from '../../hooks/usePagination.js'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'

// Debugging/monitoring tool for the Tier 3 async ZIP job queue (v1.5.8).
//
// Retry is intentionally NOT built here: zip_jobs doesn't store the
// actual imageKeys/fileNames that were requested (only counts), so
// there's no way to reconstruct and re-trigger a failed job from this
// row alone -- a real retry means going back to the gallery and clicking
// download again. Building that would mean storing full selections on
// every job row for a debug-only feature, not worth it here.
//
// Scoped implicitly to the current photographer via the existing
// "Photographers can read own galleries' zip jobs" RLS policy (see
// sql/025) -- no explicit photographer_id filter needed, same as every
// other RLS-protected read in this app.
//
// Filtering, search, and pagination all run server-side (not fetch-100-
// then-filter-in-JS) so this scales as the table grows -- zip_jobs rows
// aren't currently cleaned up after the R2 lifecycle rule expires the
// underlying file, so row count only ever goes up over time; worth a
// cleanup job at some point, but out of scope for this feature.
const JOB_STATUS_STYLE = {
  queued: { bg: '#f3f4f6', fg: '#374151', label: 'Queued' },
  processing: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Processing' },
  ready: { bg: '#d1fae5', fg: '#047857', label: 'Ready' },
  failed: { bg: '#fee2e2', fg: '#b91c1c', label: 'Failed' },
  expired: { bg: '#f3f4f6', fg: '#6b7280', label: 'Expired' },
}

function SourceBadge({ isDedup }) {
  return isDedup
    ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={{ background: '#ede9fe', color: '#6d28d9' }}>Cache hit</span>
    : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Workflow</span>
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function timeUntil(iso) {
  if (!iso) return '—'
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return 'expired'
  const hrs = Math.floor(diffMs / 3600000)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

// Shared confirm content -- rendered inside a Modal on desktop and a
// BottomSheet on mobile (see ExpireConfirm below). Kept as one component
// so the copy/behavior can't drift between the two surfaces.
function ExpireConfirmContent({ job, expiring, onConfirm, onCancel }) {
  return (
    <div className="px-5 py-5">
      <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Expire this download?</p>
      <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
        This deletes the ZIP file for <span style={{ color: 'var(--text)' }}>{job?.galleries?.title || 'this gallery'}</span> from storage right away, instead of waiting on the 7-day expiry.
        {' '}If any other download link points at this same file (a dedup cache hit), that link is expired too -- there's no way to undo this.
      </p>
      <div className="flex flex-col gap-2">
        <button onClick={onConfirm} disabled={expiring}
          className="flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg"
          style={{ background: '#dc2626', color: '#fff', border: 'none', cursor: expiring ? 'default' : 'pointer', opacity: expiring ? 0.7 : 1 }}>
          <Trash2 size={14} /> {expiring ? 'Expiring…' : 'Expire download'}
        </button>
        <button onClick={onCancel} disabled={expiring}
          className="text-sm font-medium px-4 py-2.5 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: expiring ? 'default' : 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ExpireConfirm({ job, expiring, onConfirm, onCancel, isMobile }) {
  if (!job) return null
  if (isMobile) {
    return (
      <BottomSheet open={!!job} onClose={onCancel}>
        <ExpireConfirmContent job={job} expiring={expiring} onConfirm={onConfirm} onCancel={onCancel} />
      </BottomSheet>
    )
  }
  return (
    <Modal title="Expire download" onClose={onCancel} size="sm">
      <ExpireConfirmContent job={job} expiring={expiring} onConfirm={onConfirm} onCancel={onCancel} />
    </Modal>
  )
}

export default function ZipJobMonitorSection() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [jobs, setJobs] = useState(null)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ active: 0, ready: 0, dedupHits: 0, failed: 0 })
  const [expiring, setExpiring] = useState(false)
  const [expireTarget, setExpireTarget] = useState(null)

  // Guards against out-of-order async responses -- e.g. typing into
  // search fires a fetch, then quickly changing the size filter fires a
  // second fetch; if the FIRST (now-stale) request happens to resolve
  // AFTER the second one due to network jitter, it would otherwise
  // silently overwrite the correct, more recent filtered results with
  // stale data. Each loadJobs() call increments this and captures its
  // own sequence number; the response is only applied if no newer
  // request has started in the meantime.
  const requestSeq = useRef(0)

  const pagination = usePagination({
    totalCount,
    initialPageSize: 10,
    resetKey: `${statusFilter}|${sizeFilter}|${search}`,
  })
  const { page, setPage, pageSize, setPageSize, totalPages, from, to, rangeStart, rangeEnd } = pagination

  useEffect(() => { loadJobs() }, [statusFilter, sizeFilter, search, page, pageSize])
  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const [active1, active2, ready, dedupHits, failed] = await Promise.all([
      supabase.from('zip_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('zip_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('zip_jobs').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('zip_jobs').select('id', { count: 'exact', head: true }).not('dedup_source_job_id', 'is', null),
      supabase.from('zip_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ])
    setStats({
      active: (active1.count || 0) + (active2.count || 0),
      ready: ready.count || 0,
      dedupHits: dedupHits.count || 0,
      failed: failed.count || 0,
    })
  }

  async function loadJobs() {
    const mySeq = ++requestSeq.current
    setLoading(true)
    let query = supabase
      .from('zip_jobs')
      .select('id, status, size, image_count, images_completed, skipped_images, dedup_source_job_id, final_size_bytes, created_at, expires_at, error_message, galleries!inner(title)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (sizeFilter !== 'all') query = query.eq('size', sizeFilter)
    if (search.trim()) query = query.ilike('galleries.title', `%${search.trim()}%`)

    const { data, count, error } = await query

    // A newer request has since started -- this response is stale,
    // discard it rather than let it clobber more recent, correct state.
    if (mySeq !== requestSeq.current) return

    if (error) { console.error('Failed to load zip_jobs:', error); setLoading(false); return }
    setJobs(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  async function handleExpire() {
    if (!expireTarget) return
    setExpiring(true)
    try {
      await expireZipJob(expireTarget.id)
      await Promise.all([loadJobs(), loadStats()])
      setExpireTarget(null)
    } catch (err) {
      console.error('Expire failed:', err)
    } finally {
      setExpiring(false)
    }
  }

  if (jobs === null) return null

  const failedWithMessage = jobs.filter(j => j.status === 'failed' && j.error_message)

  return (
    <SettingsSection
      title="Zip job monitor"
      description="Recent hi-res and web-size download jobs across all your galleries -- includes queue status, progress, and whether a job was a fresh build or a dedup cache hit."
      action={
        <button onClick={() => { loadJobs(); loadStats() }} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap"
          style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: loading ? 'default' : 'pointer', border: 'none', opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      }>
      <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Active', value: stats.active },
            { label: 'Ready', value: stats.ready },
            { label: 'Dedup hits', value: stats.dedupHits },
            { label: 'Failed', value: stats.failed },
          ].map(s => (
            <div key={s.label} className="rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-subtle)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <p className="text-lg font-medium" style={{ color: 'var(--text)' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status"
            className="text-xs rounded-lg px-2.5 py-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} aria-label="Filter by size"
            className="text-xs rounded-lg px-2.5 py-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
            <option value="all">Hi-res + web</option>
            <option value="hires">Hi-res only</option>
            <option value="web">Web only</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by gallery"
            className="text-xs rounded-lg px-2.5 py-1.5 flex-1 min-w-[140px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            {totalCount === 0 && statusFilter === 'all' && sizeFilter === 'all' && !search
              ? 'No download jobs yet.'
              : 'No jobs match these filters.'}
          </p>
        ) : isMobile ? (
          <div className="flex flex-col gap-2">
            {jobs.map(j => {
              const skippedCount = Array.isArray(j.skipped_images) ? j.skipped_images.length : 0
              const progress = j.status === 'queued'
                ? '—'
                : `${j.images_completed}/${j.image_count}${skippedCount ? ` (${skippedCount} skip.)` : ''}`
              return (
                <div key={j.id} className="rounded-xl px-3 py-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text)' }}>{j.galleries?.title || 'Deleted gallery'}</p>
                    <div className="shrink-0"><StatusBadge status={j.status} styles={JOB_STATUS_STYLE} /></div>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {j.size === 'web' ? 'Web' : 'Hi-res'} &middot; {progress} &middot; {timeAgo(j.created_at)}
                  </p>
                  <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <SourceBadge isDedup={!!j.dedup_source_job_id} />
                    {j.status === 'ready' && (
                      <button onClick={() => setExpireTarget(j)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                        Expire
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Gallery', 'Type', 'Status', 'Progress', 'Size', 'Source', 'Timing', ''].map(h => (
                    <th key={h} className="text-left font-medium px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j, idx) => {
                  const skippedCount = Array.isArray(j.skipped_images) ? j.skipped_images.length : 0
                  const progress = j.status === 'queued'
                    ? '—'
                    : `${j.images_completed}/${j.image_count}${skippedCount ? ` (${skippedCount} skip.)` : ''}`
                  return (
                    <tr key={j.id} style={{ borderBottom: idx === jobs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                      <td className="px-2 py-2" style={{ color: 'var(--text)' }}>{j.galleries?.title || 'Deleted gallery'}</td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{j.size === 'web' ? 'Web' : 'Hi-res'}</td>
                      <td className="px-2 py-2"><StatusBadge status={j.status} styles={JOB_STATUS_STYLE} /></td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{progress}</td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatBytes(j.final_size_bytes)}</td>
                      <td className="px-2 py-2 whitespace-nowrap"><SourceBadge isDedup={!!j.dedup_source_job_id} /></td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)', lineHeight: 1.35 }}>
                        <div>{timeAgo(j.created_at)}</div>
                        {j.status === 'ready' && <div style={{ fontSize: '10px' }}>exp. {timeUntil(j.expires_at)}</div>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        {j.status === 'ready' && (
                          <button onClick={() => setExpireTarget(j)}
                            className="text-xs font-medium px-2 py-1 rounded-lg"
                            style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                            Expire
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationFooter
          page={page} setPage={setPage}
          pageSize={pageSize} setPageSize={setPageSize}
          totalPages={totalPages} rangeStart={rangeStart} rangeEnd={rangeEnd} totalCount={totalCount}
          className="-mx-5 px-5"
        />

        {failedWithMessage.length > 0 && (
          <div className="mt-4 flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {failedWithMessage.map(j => (
                <p key={j.id} className="mb-1">
                  <span style={{ color: 'var(--text)' }}>{j.galleries?.title || 'Deleted gallery'}:</span> {j.error_message}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <ExpireConfirm
        job={expireTarget}
        expiring={expiring}
        isMobile={isMobile}
        onConfirm={handleExpire}
        onCancel={() => { if (!expiring) setExpireTarget(null) }}
      />
    </SettingsSection>
  )
}
