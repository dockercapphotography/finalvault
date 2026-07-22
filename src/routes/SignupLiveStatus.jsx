import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { getSignupPage, getSlots } from '../utils/signupApi.js'

// Realtime requires the table to have replication enabled in Supabase
// (Database -> Replication -> toggle signup_slots on) -- not automatic
// for new tables. Falls back to a periodic refetch if the realtime
// channel is unavailable or silently drops, since a flaky convention-hall
// WiFi connection is a real, ordinary occurrence, not an edge case. Worth
// noting the double-booking guarantee itself doesn't depend on this page
// at all -- that's enforced at the database level by the exclusion
// constraint regardless of what's on screen here, so the worst case of a
// dropped connection is a stale display, not a real conflict.
const FALLBACK_REFETCH_MS = 30_000

function timeLabel(iso, timezone) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function dayLabel(iso, timezone) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' })
}

function dayKey(iso, timezone) {
  // en-CA gives YYYY-MM-DD, a clean sortable/comparable key
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })
}

function ProgressStat({ claimed, total }) {
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0
  const open = total - claimed
  return (
    <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-center justify-between" style={{ background: 'rgba(99,102,241,0.1)' }}>
      <div>
        <p className="m-0" style={{ fontSize: 22, fontWeight: 500, color: '#26215C' }}>
          {claimed}<span style={{ fontSize: 14, fontWeight: 400, color: '#534AB7' }}> / {total} claimed</span>
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#534AB7' }}>
          {total === 0 ? 'No slots yet' : open === 0 ? 'Fully booked' : `${open} slot${open === 1 ? '' : 's'} still open`}
        </p>
      </div>
      <div className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: 44, height: 44, background: `conic-gradient(#6366f1 0% ${pct}%, #CECBF6 ${pct}% 100%)` }}>
        <div className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: '#EEEDFE' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#3C3489' }}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}

export default function SignupLiveStatus() {
  const { id } = useParams()
  const [page, setPage] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      const [p, s] = await Promise.all([getSignupPage(id), getSlots(id)])
      setPage(p)
      setSlots(s)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  // Realtime subscription -- any insert/update/delete on this page's slots
  // (a claim, a manually deleted slot, a freshly generated batch) refetches
  // immediately rather than trying to patch individual rows in place,
  // since the grouping/sorting logic is cheap to just rerun.
  useEffect(() => {
    const channel = supabase
      .channel(`signup_slots_${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'signup_slots', filter: `signup_page_id=eq.${id}` },
        () => load()
      )
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    const fallbackInterval = setInterval(load, FALLBACK_REFETCH_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallbackInterval)
    }
  }, [id])

  const days = useMemo(() => {
    const map = {}
    for (const s of slots) {
      const key = dayKey(s.start_time, page?.timezone)
      if (!map[key]) map[key] = { key, label: dayLabel(s.start_time, page?.timezone), slots: [] }
      map[key].slots.push(s)
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [slots, page])

  useEffect(() => {
    if (!page || days.length === 0) return
    if (selectedDay && days.some(d => d.key === selectedDay)) return
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: page.timezone })
    const todayMatch = days.find(d => d.key === todayKey)
    setSelectedDay((todayMatch || days[0]).key)
  }, [days, page])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Signup page not found.</p>
      </div>
    )
  }

  const activeDay = days.find(d => d.key === selectedDay)
  const sortedSlots = activeDay ? [...activeDay.slots].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)) : []
  const claimedCount = activeDay ? activeDay.slots.filter(s => s.claimed_at).length : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="sticky top-0 z-10" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/sessions" style={{ color: 'var(--text-muted)', display: 'flex' }}>
              <ArrowLeft size={16} />
            </Link>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
          </div>
          <span title={connected ? 'Live' : 'Reconnecting...'}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0"
            style={{
              color: connected ? '#27500A' : 'var(--text-muted)',
              background: connected ? '#EAF3DE' : 'var(--bg-subtle)',
            }}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
        {days.length > 1 && (
          <div className="flex gap-1 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {days.map(d => (
              <button key={d.key} onClick={() => setSelectedDay(d.key)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{
                  background: d.key === selectedDay ? '#6366f1' : 'var(--bg-subtle)',
                  color: d.key === selectedDay ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {activeDay && <ProgressStat claimed={claimedCount} total={activeDay.slots.length} />}

        {sortedSlots.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>No slots for this day.</p>
        ) : (
          <div className="space-y-2">
            {sortedSlots.map(slot => {
              const shootType = page.signup_shoot_types.find(t => t.id === slot.shoot_type_id)
              return (
                <div key={slot.id} className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div style={{ width: 4, flexShrink: 0, background: slot.claimed_at ? '#6366f1' : 'var(--border-strong)' }} />
                  <div className="flex-1 min-w-0 px-4 py-3" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>{timeLabel(slot.start_time, page.timezone)}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: slot.claimed_at ? 'rgba(99,102,241,0.1)' : 'var(--bg-subtle)',
                          color: slot.claimed_at ? '#6366f1' : 'var(--text-muted)',
                        }}>
                        {slot.claimed_at ? 'Claimed' : 'Open'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType?.name || 'Unknown shoot type'}</p>
                    {slot.claimed_at && (
                      <div className="mt-1.5">
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{slot.client_name}{slot.client_pronouns && <span className="font-normal" style={{ color: 'var(--text-muted)' }}> ({slot.client_pronouns})</span>}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{slot.client_email}{slot.client_phone && ` · ${slot.client_phone}`}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
