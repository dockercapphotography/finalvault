import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, CalendarDays } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { useBookingBranding } from '../utils/bookingBranding.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'
import BookingCover from '../components/booking/BookingCover.jsx'

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

// A plain generic camera icon next to a title/date row -- the original
// treatment here -- undersold what these sessions actually look like once
// the individual /book/:token pages themselves became this visual (cover
// pattern or, once uploaded, a real photo -- BookingCover.jsx). Each card
// now leads with that same cover, same component, same theme variables,
// so the chooser reads as a genuine preview of what's behind each link
// rather than a plain list. fade={false} on BookingCover: its own
// fade-to-bk-bg bottom treatment is right where it normally sits (hidden
// under an overlapping card or a dark scrim in BookingHero.jsx) but wrong
// here, where the cover sits directly above a plain --bk-surface card
// body -- the card's own border is what separates the two instead.
function SignupPageRow({ page }) {
  const hasOpenSlots = !!page.earliest_open_slot
  return (
    <Link to={`/book/${page.token}`}
      className="block rounded-xl overflow-hidden transition-colors"
      style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bk-accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bk-border)' }}>
      <div className="aspect-[16/9]" style={{ position: 'relative' }}>
        <BookingCover
          pattern={page.cover_pattern} imageKey={page.cover_image_r2_key}
          focusX={page.cover_focus_x} focusY={page.cover_focus_y}
          height="100%" fade={false}
        />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{page.title}</p>
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: hasOpenSlots ? 'var(--bk-muted)' : 'var(--danger)' }}>
          <CalendarDays size={11} style={{ flexShrink: 0 }} />
          {formatSessionDates(page)}
        </p>
        {page.venue_address && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--bk-muted)' }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {page.venue_address}
          </p>
        )}
      </div>
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

  // Safe before data has loaded (branding just defaults to the unbranded
  // shape) -- kept above the early returns below along with
  // useBookingBranding's own effect so hook order never changes across
  // renders. Same reasoning as SignupBooking.jsx.
  const branding = data?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)

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
    <div className="min-h-screen px-4 py-8" style={{ ...bkVars, background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      <div className="max-w-md mx-auto">
        <BrandHeader branding={branding} />

        <div className="text-center mb-6">
          <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>Choose a session to book</p>
        </div>

        <div className="space-y-4">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>
      </div>
    </div>
  )
}
