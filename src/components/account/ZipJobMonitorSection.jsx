import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import SettingsSection from '../ui/SettingsSection.jsx'

// Debugging/monitoring tool for the Tier 3 async ZIP job queue (v1.5.8).
// View-only by design: zip_jobs doesn't store the actual imageKeys/
// fileNames that were requested (only counts), so there's no way to
// reconstruct and re-trigger a failed job from this row alone -- a real
// retry means going back to the gallery and clicking download again.
// Building that would mean storing full selections on every job row for
// a debug-only feature, not worth it here.
//
// Scoped implicitly to the current photographer via the existing
// "Photographers can read own galleries' zip jobs" RLS policy (see
// sql/025) -- no explicit photographer_id filter needed, same as every
// other RLS-protected read in this app.
//
// Bounded to the most recent 100 jobs rather than a full table scan --
// this is a debugging aid, not a paginated report. zip_jobs rows aren't
// currently cleaned up after the R2 lifecycle rule expires the
// underlying file, so this table grows indefinitely; worth a cleanup
// job at some point, but out of scope for this feature.
const JOB_LIMIT = 100

const STATUS_STYLE = {
  queued: { bg: '#f3f4f6', fg: '#374151', label: 'Queued' },
  processing: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Processing' },
  ready: { bg: '#d1fae5', fg: '#047857', label: 'Ready' },
  failed: { bg: '#fee2e2', fg: '#b91c1c', label: 'Failed' },
  expired: { bg: '#f3f4f6', fg: '#6b7280', label: 'Expired' },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.queued
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  )
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

export default function ZipJobMonitorSection() {
  const [jobs, setJobs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('zip_jobs')
      .select('id, status, size, image_count, images_completed, skipped_images, dedup_source_job_id, created_at, expires_at, error_message, galleries(title)')
      .order('created_at', { ascending: false })
      .limit(JOB_LIMIT)
    if (error) { console.error('Failed to load zip_jobs:', error); setLoading(false); return }
    setJobs(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!jobs) return []
    const q = search.trim().toLowerCase()
    return jobs.filter(j => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false
      if (sizeFilter !== 'all' && j.size !== sizeFilter) return false
      if (q && !(j.galleries?.title || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [jobs, statusFilter, sizeFilter, search])

  const stats = useMemo(() => {
    if (!jobs) return { active: 0, ready: 0, dedupHits: 0, failed: 0 }
    return jobs.reduce((acc, j) => {
      if (j.status === 'queued' || j.status === 'processing') acc.active++
      if (j.status === 'ready') acc.ready++
      if (j.dedup_source_job_id) acc.dedupHits++
      if (j.status === 'failed') acc.failed++
      return acc
    }, { active: 0, ready: 0, dedupHits: 0, failed: 0 })
  }, [jobs])

  if (jobs === null && loading) return null

  return (
    <SettingsSection
      title="Zip job monitor"
      description="Recent hi-res and web-size download jobs across all your galleries -- includes queue status, progress, and whether a job was a fresh build or a dedup cache hit."
      action={
        <button onClick={loadJobs} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
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
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg px-2.5 py-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}
            className="text-xs rounded-lg px-2.5 py-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
            <option value="all">Hi-res + web</option>
            <option value="hires">Hi-res only</option>
            <option value="web">Web only</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by gallery"
            className="text-xs rounded-lg px-2.5 py-1.5 flex-1 min-w-[140px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            {jobs.length === 0 ? 'No download jobs yet.' : 'No jobs match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs" style={{ minWidth: '640px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Gallery', 'Size', 'Status', 'Progress', 'Source', 'Requested', 'Expires'].map(h => (
                    <th key={h} className="text-left font-medium px-3 py-2" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(j => {
                  const skippedCount = Array.isArray(j.skipped_images) ? j.skipped_images.length : 0
                  const progress = j.status === 'queued'
                    ? '—'
                    : `${j.images_completed}/${j.image_count}${skippedCount ? ` (${skippedCount} skipped)` : ''}`
                  return (
                    <tr key={j.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{j.galleries?.title || 'Deleted gallery'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{j.size === 'web' ? 'Web' : 'Hi-res'}</td>
                      <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{progress}</td>
                      <td className="px-3 py-2">
                        {j.dedup_source_job_id
                          ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#ede9fe', color: '#6d28d9' }}>Cache hit</span>
                          : <span style={{ color: 'var(--text-muted)' }}>Workflow</span>}
                      </td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{timeAgo(j.created_at)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>
                        {j.status === 'ready' ? timeUntil(j.expires_at) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.some(j => j.status === 'failed' && j.error_message) && (
          <div className="mt-4 flex items-start gap-2">
            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {filtered.filter(j => j.status === 'failed' && j.error_message).map(j => (
                <p key={j.id} className="mb-1">
                  <span style={{ color: 'var(--text)' }}>{j.galleries?.title || 'Deleted gallery'}:</span> {j.error_message}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
