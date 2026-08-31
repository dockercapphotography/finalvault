import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, CalendarDays, Camera } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'

// ── Data (anonymous, via supabaseAnon -- same isolation pattern as
// SignupBooking.jsx: this is a fully public page, so it never touches the
// authenticated `supabase` client or anything that could carry a leaked
// photographer session along with the request. See supabaseClientAnon.js's
// own comment. ) ──────────────────────────────────────────────────────────

async function getSignupPagesByToken(token) {
  const { data, error } = await supabaseAnon.rpc('get_signup_pages_by_token', { p_token: token })
  if (error) throw error
  return data
}

// ── UI ───────────────────────────────────────────────────────────────────────

function CenteredMessage({ title, body }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <p className="text-base font-medium" style={{ color: 'var(--text)' }}>{title}</p>
        {body && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{body}</p>}
      </div>
    </div>
  )
}

// Nick's explicit requirement: each row shows its dates, not just the
// title/venue -- formatted from the earliest/latest OPEN future slot the
// RPC already computed server-side, in that page's own timezone.
function formatSessionDates(page) {
  if (!page.earliest_open_slot) return 'No upcoming times open'
  const start = new Date(page.earliest_open_slot)
  const end = page.latest_open_slot ? new Date(page.latest_open_slot) : start
  const fmt = d => d.toLocaleDateString('en-US', { timeZone: page.timezone, month: 'short', day: 'numeric' })
  const startStr = fmt(start)
  const endStr = fmt(end)
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`
}

function SignupPageRow({ page }) {
  const hasOpenSlots = !!page.earliest_open_slot
  return (
    <Link to={`/book/${page.token}`}
      className="w-full flex items-center gap-3 text-left rounded-xl p-3.5 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>
        <Camera size={17} style={{ color: '#6366f1' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{page.title}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: hasOpenSlots ? 'var(--text-muted)' : 'var(--danger)' }}>
          <CalendarDays size={11} style={{ flexShrink: 0 }} />
          {formatSessionDates(page)}
        </p>
        {page.venue_address && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {page.venue_address}
          </p>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  )
}

export default function AllSessionsBooking() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const result = await getSignupPagesByToken(token)
      if (!result || result.type === 'not_found') { setNotFound(true); return }
      // Single active session: skip the chooser entirely and go straight
      // to its own booking page, per the agreed passthrough behavior.
      if (result.signup_pages.length === 1) {
        navigate(`/book/${result.signup_pages[0].token}`, { replace: true })
        return
      }
      setData(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound) return <CenteredMessage title="This link isn't valid" body="Double-check the link, or contact the photographer directly." />
  if (!data) return null
  if (data.signup_pages.length === 0) return <CenteredMessage title={data.business_name || 'No sessions open'} body="Nothing is open for booking right now. Check back soon, or contact the photographer directly." />

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{data.business_name}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Choose a session to book</p>
        </div>

        <div className="space-y-2">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>
      </div>
    </div>
  )
}
